import type { EncryptedBackup, PasswordVerifier } from '@/types/app'

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const PASSWORD_ITERATIONS = 180_000

function toArrayBuffer(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

function bytesToBase64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
}

function base64ToBytes(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0))
}

async function importPasswordKey(password: string) {
  return window.crypto.subtle.importKey(
    'raw',
    toArrayBuffer(encoder.encode(password)),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey'],
  )
}

async function derivePasswordHash(password: string, salt: Uint8Array, iterations: number) {
  const passwordKey = await importPasswordKey(password)
  const hashBuffer = await window.crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: toArrayBuffer(salt),
      iterations,
    },
    passwordKey,
    256,
  )

  return bytesToBase64(new Uint8Array(hashBuffer))
}

async function deriveEncryptionKey(password: string, salt: Uint8Array) {
  const passwordKey = await importPasswordKey(password)
  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: toArrayBuffer(salt),
      iterations: PASSWORD_ITERATIONS,
    },
    passwordKey,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function createPasswordVerifier(password: string): Promise<PasswordVerifier> {
  const salt = window.crypto.getRandomValues(new Uint8Array(16))
  const hash = await derivePasswordHash(password, salt, PASSWORD_ITERATIONS)

  return {
    version: 1,
    salt: bytesToBase64(salt),
    hash,
    iterations: PASSWORD_ITERATIONS,
  }
}

export async function verifyPassword(password: string, verifier: PasswordVerifier) {
  const hash = await derivePasswordHash(
    password,
    base64ToBytes(verifier.salt),
    verifier.iterations,
  )

  return hash === verifier.hash
}

export async function encryptJson<T>(payload: T, password: string): Promise<EncryptedBackup> {
  const salt = window.crypto.getRandomValues(new Uint8Array(16))
  const iv = window.crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveEncryptionKey(password, salt)
  const encrypted = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(iv),
    },
    key,
    toArrayBuffer(encoder.encode(JSON.stringify(payload))),
  )

  return {
    version: 1,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(encrypted)),
  }
}

export async function decryptJson<T>(payload: EncryptedBackup, password: string): Promise<T> {
  const key = await deriveEncryptionKey(password, base64ToBytes(payload.salt))
  const decrypted = await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(base64ToBytes(payload.iv)),
    },
    key,
    toArrayBuffer(base64ToBytes(payload.data)),
  )

  return JSON.parse(decoder.decode(decrypted)) as T
}
