import { useEffect, useState } from 'react'

import { createPasswordVerifier, decryptJson, encryptJson, verifyPassword } from '@/lib/crypto'
import { normalizePath } from '@/lib/utils'
import type { EncryptedBackup, PasswordVerifier, PublicAppConfig, ServiceItem } from '@/types/app'

const PUBLIC_CONFIG_KEY = 'redirect-page-public-config'
const AUTH_KEY = 'redirect-page-admin-auth'
const BACKUP_KEY = 'redirect-page-admin-backup'
const SESSION_PASSWORD_KEY = 'redirect-page-session-password'
const CONFIG_EVENT = 'redirect-page-config-updated'

const defaultConfig: PublicAppConfig = {
  siteTitle: 'Local Services',
  siteDescription: 'Local service list managed manually from the settings page.',
  lanIpv4: '',
  services: [],
  updatedAt: new Date().toISOString(),
}

function parseJson<T>(value: string | null): T | null {
  if (!value) {
    return null
  }

  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function sanitizeService(service: ServiceItem): ServiceItem {
  return {
    id: service.id || window.crypto.randomUUID(),
    name: service.name.trim(),
    description: service.description.trim(),
    port: service.port.trim(),
    path: normalizePath(service.path),
    protocol: service.protocol === 'https' ? 'https' : 'http',
    category: service.category.trim() || 'service',
    lanEnabled: Boolean(service.lanEnabled),
  }
}

function sanitizeConfig(config: PublicAppConfig): PublicAppConfig {
  return {
    siteTitle: config.siteTitle.trim() || defaultConfig.siteTitle,
    siteDescription: config.siteDescription.trim() || defaultConfig.siteDescription,
    lanIpv4: config.lanIpv4.trim(),
    services: config.services
      .map(sanitizeService)
      .filter((service) => service.name && service.port),
    updatedAt: config.updatedAt || new Date().toISOString(),
  }
}

export function loadPublicConfig() {
  return sanitizeConfig(parseJson<PublicAppConfig>(localStorage.getItem(PUBLIC_CONFIG_KEY)) ?? defaultConfig)
}

export function savePublicConfig(config: PublicAppConfig) {
  const nextConfig = sanitizeConfig({
    ...config,
    updatedAt: new Date().toISOString(),
  })

  localStorage.setItem(PUBLIC_CONFIG_KEY, JSON.stringify(nextConfig))
  window.dispatchEvent(new Event(CONFIG_EVENT))
  return nextConfig
}

export function usePublicConfig() {
  const [config, setConfig] = useState<PublicAppConfig>(() => loadPublicConfig())

  useEffect(() => {
    const syncConfig = () => {
      setConfig(loadPublicConfig())
    }

    window.addEventListener(CONFIG_EVENT, syncConfig)
    window.addEventListener('storage', syncConfig)
    return () => {
      window.removeEventListener(CONFIG_EVENT, syncConfig)
      window.removeEventListener('storage', syncConfig)
    }
  }, [])

  return config
}

function loadPasswordVerifier() {
  return parseJson<PasswordVerifier>(localStorage.getItem(AUTH_KEY))
}

function loadEncryptedBackup() {
  return parseJson<EncryptedBackup>(localStorage.getItem(BACKUP_KEY))
}

export function hasAdminPassword() {
  return Boolean(loadPasswordVerifier())
}

export function getCachedSessionPassword() {
  return sessionStorage.getItem(SESSION_PASSWORD_KEY) ?? ''
}

export function clearCachedSessionPassword() {
  sessionStorage.removeItem(SESSION_PASSWORD_KEY)
}

function cacheSessionPassword(password: string) {
  sessionStorage.setItem(SESSION_PASSWORD_KEY, password)
}

export async function initializeAdminPassword(password: string, config: PublicAppConfig) {
  const verifier = await createPasswordVerifier(password)
  const savedConfig = savePublicConfig(config)
  const encryptedBackup = await encryptJson(savedConfig, password)

  localStorage.setItem(AUTH_KEY, JSON.stringify(verifier))
  localStorage.setItem(BACKUP_KEY, JSON.stringify(encryptedBackup))
  cacheSessionPassword(password)

  return savedConfig
}

export async function unlockAdmin(password: string) {
  const verifier = loadPasswordVerifier()
  if (!verifier) {
    return false
  }

  const verified = await verifyPassword(password, verifier)
  if (verified) {
    cacheSessionPassword(password)
  }

  return verified
}

export async function saveAdminConfig(config: PublicAppConfig, password = getCachedSessionPassword()) {
  if (!password) {
    throw new Error('missing-password')
  }

  const savedConfig = savePublicConfig(config)
  const encryptedBackup = await encryptJson(savedConfig, password)
  localStorage.setItem(BACKUP_KEY, JSON.stringify(encryptedBackup))

  return savedConfig
}

export async function restoreFromEncryptedBackup(password = getCachedSessionPassword()) {
  if (!password) {
    throw new Error('missing-password')
  }

  const backup = loadEncryptedBackup()
  if (!backup) {
    throw new Error('missing-backup')
  }

  const restoredConfig = await decryptJson<PublicAppConfig>(backup, password)
  return savePublicConfig(restoredConfig)
}

export async function changeAdminPassword(currentPassword: string, nextPassword: string) {
  const verified = await unlockAdmin(currentPassword)
  if (!verified) {
    throw new Error('invalid-password')
  }

  const verifier = await createPasswordVerifier(nextPassword)
  const encryptedBackup = await encryptJson(loadPublicConfig(), nextPassword)

  localStorage.setItem(AUTH_KEY, JSON.stringify(verifier))
  localStorage.setItem(BACKUP_KEY, JSON.stringify(encryptedBackup))
  cacheSessionPassword(nextPassword)
}

export function buildServiceUrl(service: ServiceItem, host: string) {
  const normalizedHost = host.trim()
  const normalizedPath = normalizePath(service.path)
  return `${service.protocol}://${normalizedHost}:${service.port}${normalizedPath}`
}
