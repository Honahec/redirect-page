import { randomUUID, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, join } from 'node:path'

const DATA_DIR = process.env.DATA_DIR || '/data'
const PORT = Number(process.env.PORT || 3000)
const STATE_FILE = join(DATA_DIR, 'state.json')
const PASSWORD_ITERATIONS = 180_000
const MAX_BODY_SIZE = 1024 * 1024

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function createDefaultConfig() {
  return {
    siteTitle: 'Local Services',
    siteDescription: 'Local service list managed manually from the settings page.',
    lanIpv4: '',
    services: [],
    updatedAt: new Date().toISOString(),
  }
}

function createDefaultState() {
  return {
    config: createDefaultConfig(),
    auth: null,
    backup: null,
  }
}

function normalizePath(pathname) {
  const trimmed = typeof pathname === 'string' ? pathname.trim() : ''
  if (!trimmed) {
    return ''
  }

  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

function sanitizeService(service) {
  return {
    id:
      typeof service?.id === 'string' && service.id.trim()
        ? service.id.trim()
        : randomUUID(),
    name: typeof service?.name === 'string' ? service.name.trim() : '',
    description:
      typeof service?.description === 'string' ? service.description.trim() : '',
    port: typeof service?.port === 'string' ? service.port.trim() : '',
    path: normalizePath(service?.path),
    protocol: service?.protocol === 'https' ? 'https' : 'http',
    category:
      typeof service?.category === 'string' && service.category.trim()
        ? service.category.trim()
        : 'service',
    lanEnabled: Boolean(service?.lanEnabled),
  }
}

function sanitizeConfig(config) {
  const fallback = createDefaultConfig()
  const services = Array.isArray(config?.services) ? config.services : []

  return {
    siteTitle:
      typeof config?.siteTitle === 'string' && config.siteTitle.trim()
        ? config.siteTitle.trim()
        : fallback.siteTitle,
    siteDescription:
      typeof config?.siteDescription === 'string' && config.siteDescription.trim()
        ? config.siteDescription.trim()
        : fallback.siteDescription,
    lanIpv4: typeof config?.lanIpv4 === 'string' ? config.lanIpv4.trim() : '',
    services: services
      .map(sanitizeService)
      .filter((service) => service.name && service.port),
    updatedAt:
      typeof config?.updatedAt === 'string' && config.updatedAt.trim()
        ? config.updatedAt
        : fallback.updatedAt,
  }
}

function isPasswordVerifier(value) {
  return (
    value?.version === 1 &&
    typeof value?.salt === 'string' &&
    typeof value?.hash === 'string' &&
    Number.isInteger(value?.iterations)
  )
}

function isEncryptedBackup(value) {
  return (
    value?.version === 1 &&
    typeof value?.salt === 'string' &&
    typeof value?.iv === 'string' &&
    typeof value?.data === 'string'
  )
}

function normalizeState(state) {
  return {
    config: sanitizeConfig(state?.config),
    auth: isPasswordVerifier(state?.auth) ? state.auth : null,
    backup: isEncryptedBackup(state?.backup) ? state.backup : null,
  }
}

async function ensureDataDir() {
  await mkdir(dirname(STATE_FILE), { recursive: true })
}

async function loadState() {
  await ensureDataDir()

  try {
    const content = await readFile(STATE_FILE, 'utf8')
    return normalizeState(JSON.parse(content))
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return createDefaultState()
    }

    throw error
  }
}

async function saveState(state) {
  const normalized = normalizeState(state)
  const serialized = `${JSON.stringify(normalized, null, 2)}\n`
  const tempFile = `${STATE_FILE}.tmp`

  await ensureDataDir()
  await writeFile(tempFile, serialized, 'utf8')
  await rename(tempFile, STATE_FILE)

  return normalized
}

function bytesToBase64(bytes) {
  return Buffer.from(bytes).toString('base64')
}

function base64ToBytes(value) {
  return new Uint8Array(Buffer.from(value, 'base64'))
}

function toArrayBuffer(bytes) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
}

async function importPasswordKey(password) {
  return globalThis.crypto.subtle.importKey(
    'raw',
    toArrayBuffer(encoder.encode(password)),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey'],
  )
}

async function derivePasswordHash(password, salt, iterations) {
  const passwordKey = await importPasswordKey(password)
  const hashBuffer = await globalThis.crypto.subtle.deriveBits(
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

async function deriveEncryptionKey(password, salt) {
  const passwordKey = await importPasswordKey(password)
  return globalThis.crypto.subtle.deriveKey(
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

function createRandomBytes(length) {
  const bytes = new Uint8Array(length)
  globalThis.crypto.getRandomValues(bytes)
  return bytes
}

async function createPasswordVerifier(password) {
  const salt = createRandomBytes(16)
  const hash = await derivePasswordHash(password, salt, PASSWORD_ITERATIONS)

  return {
    version: 1,
    salt: bytesToBase64(salt),
    hash,
    iterations: PASSWORD_ITERATIONS,
  }
}

async function verifyPassword(password, verifier) {
  const hash = await derivePasswordHash(
    password,
    base64ToBytes(verifier.salt),
    verifier.iterations,
  )

  const actual = Buffer.from(hash)
  const expected = Buffer.from(verifier.hash)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

async function encryptJson(payload, password) {
  const salt = createRandomBytes(16)
  const iv = createRandomBytes(12)
  const key = await deriveEncryptionKey(password, salt)
  const encrypted = await globalThis.crypto.subtle.encrypt(
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

async function decryptJson(payload, password) {
  const key = await deriveEncryptionKey(password, base64ToBytes(payload.salt))
  const decrypted = await globalThis.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(base64ToBytes(payload.iv)),
    },
    key,
    toArrayBuffer(base64ToBytes(payload.data)),
  )

  return JSON.parse(decoder.decode(decrypted))
}

async function readJsonBody(request) {
  const chunks = []
  let size = 0

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length

    if (size > MAX_BODY_SIZE) {
      const error = new Error('request-too-large')
      error.statusCode = 413
      throw error
    }

    chunks.push(buffer)
  }

  if (chunks.length === 0) {
    return {}
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    const error = new Error('invalid-json')
    error.statusCode = 400
    throw error
  }
}

function respondJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  })
  response.end(`${JSON.stringify(payload)}\n`)
}

function respondError(response, statusCode, error) {
  respondJson(response, statusCode, { error })
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function isStrongEnoughPassword(password) {
  return typeof password === 'string' && password.length >= 6
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1')

  try {
    if (request.method === 'GET' && url.pathname === '/api/config') {
      const state = await loadState()
      respondJson(response, 200, { config: state.config })
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/admin/state') {
      const state = await loadState()
      respondJson(response, 200, { initialized: Boolean(state.auth) })
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/admin/unlock') {
      const body = await readJsonBody(request)
      const state = await loadState()

      if (!state.auth || !isNonEmptyString(body.password)) {
        respondJson(response, 200, { ok: false })
        return
      }

      const ok = await verifyPassword(body.password, state.auth)
      respondJson(response, 200, { ok })
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/admin/import-legacy') {
      const body = await readJsonBody(request)
      const state = await loadState()

      if (state.auth || state.config.services.length > 0 || state.config.lanIpv4 || state.config.siteTitle !== 'Local Services' || state.config.siteDescription !== 'Local service list managed manually from the settings page.') {
        respondError(response, 409, 'already-initialized')
        return
      }

      const nextState = await saveState({
        config: sanitizeConfig(body.config),
        auth: isPasswordVerifier(body.auth) ? body.auth : null,
        backup: isEncryptedBackup(body.backup) ? body.backup : null,
      })

      respondJson(response, 200, {
        config: nextState.config,
        initialized: Boolean(nextState.auth),
      })
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/admin/initialize') {
      const body = await readJsonBody(request)
      if (!isStrongEnoughPassword(body.password)) {
        respondError(response, 400, 'invalid-password')
        return
      }

      const state = await loadState()
      if (state.auth) {
        respondError(response, 409, 'already-initialized')
        return
      }

      const config = sanitizeConfig(body.config)
      config.updatedAt = new Date().toISOString()

      const auth = await createPasswordVerifier(body.password)
      const backup = await encryptJson(config, body.password)
      const nextState = await saveState({
        config,
        auth,
        backup,
      })

      respondJson(response, 200, { config: nextState.config })
      return
    }

    if (request.method === 'PUT' && url.pathname === '/api/admin/config') {
      const body = await readJsonBody(request)
      const state = await loadState()

      if (!state.auth) {
        respondError(response, 403, 'missing-password')
        return
      }

      if (!isNonEmptyString(body.password) || !(await verifyPassword(body.password, state.auth))) {
        respondError(response, 401, 'invalid-password')
        return
      }

      const config = sanitizeConfig(body.config)
      config.updatedAt = new Date().toISOString()

      const backup = await encryptJson(config, body.password)
      const nextState = await saveState({
        ...state,
        config,
        backup,
      })

      respondJson(response, 200, { config: nextState.config })
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/admin/restore') {
      const body = await readJsonBody(request)
      const state = await loadState()

      if (!state.auth || !state.backup) {
        respondError(response, 404, 'missing-backup')
        return
      }

      if (!isNonEmptyString(body.password) || !(await verifyPassword(body.password, state.auth))) {
        respondError(response, 401, 'invalid-password')
        return
      }

      const restoredConfig = sanitizeConfig(await decryptJson(state.backup, body.password))
      restoredConfig.updatedAt = new Date().toISOString()

      const nextState = await saveState({
        ...state,
        config: restoredConfig,
      })

      respondJson(response, 200, { config: nextState.config })
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/admin/change-password') {
      const body = await readJsonBody(request)
      const state = await loadState()

      if (!state.auth) {
        respondError(response, 403, 'missing-password')
        return
      }

      if (!isNonEmptyString(body.currentPassword) || !isStrongEnoughPassword(body.nextPassword)) {
        respondError(response, 400, 'invalid-password')
        return
      }

      const verified = await verifyPassword(body.currentPassword, state.auth)
      if (!verified) {
        respondError(response, 401, 'invalid-password')
        return
      }

      const auth = await createPasswordVerifier(body.nextPassword)
      const backup = await encryptJson(state.config, body.nextPassword)
      await saveState({
        ...state,
        auth,
        backup,
      })

      respondJson(response, 200, { ok: true })
      return
    }

    respondError(response, 404, 'not-found')
  } catch (error) {
    const statusCode =
      error && typeof error === 'object' && 'statusCode' in error && Number.isInteger(error.statusCode)
        ? error.statusCode
        : 500

    const errorCode =
      statusCode === 500 ? 'internal-error' : error instanceof Error ? error.message : 'request-failed'

    respondError(response, statusCode, errorCode)
  }
})

server.listen(PORT, '0.0.0.0')
