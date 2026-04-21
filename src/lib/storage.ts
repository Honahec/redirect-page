import { useEffect, useState } from 'react'

import { normalizePath } from '@/lib/utils'
import type { EncryptedBackup, PasswordVerifier, PublicAppConfig, ServiceItem } from '@/types/app'

const PUBLIC_CONFIG_KEY = 'redirect-page-public-config'
const AUTH_KEY = 'redirect-page-admin-auth'
const BACKUP_KEY = 'redirect-page-admin-backup'
const SESSION_PASSWORD_KEY = 'redirect-page-session-password'
const CONFIG_EVENT = 'redirect-page-config-updated'
const API_ROOT = '/api'
let legacyMigrationPromise: Promise<void> | null = null
let legacyMigrationAttempted = false

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
  const fallback = getDefaultPublicConfig()

  return {
    siteTitle: config.siteTitle.trim() || fallback.siteTitle,
    siteDescription: config.siteDescription.trim() || fallback.siteDescription,
    lanIpv4: config.lanIpv4.trim(),
    services: config.services
      .map(sanitizeService)
      .filter((service) => service.name && service.port),
    updatedAt: config.updatedAt || new Date().toISOString(),
  }
}

export function getDefaultPublicConfig(): PublicAppConfig {
  return {
    siteTitle: 'Local Services',
    siteDescription: 'Local service list managed manually from the settings page.',
    lanIpv4: '',
    services: [],
    updatedAt: new Date().toISOString(),
  }
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

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  const payload = (await response.json().catch(() => null)) as
    | { error?: string }
    | T
    | null
  const errorMessage =
    payload && typeof payload === 'object' && 'error' in payload ? payload.error : undefined

  if (!response.ok) {
    throw new Error(errorMessage || 'request-failed')
  }

  return payload as T
}

function emitConfigUpdated() {
  window.dispatchEvent(new Event(CONFIG_EVENT))
}

async function migrateLegacyStateIfNeeded() {
  if (legacyMigrationAttempted) {
    return
  }

  if (legacyMigrationPromise) {
    await legacyMigrationPromise
    return
  }

  const config = parseJson<PublicAppConfig>(localStorage.getItem(PUBLIC_CONFIG_KEY))
  const auth = parseJson<PasswordVerifier>(localStorage.getItem(AUTH_KEY))
  const backup = parseJson<EncryptedBackup>(localStorage.getItem(BACKUP_KEY))

  if (!config && !auth && !backup) {
    legacyMigrationAttempted = true
    return
  }

  legacyMigrationPromise = requestJson('/admin/import-legacy', {
    method: 'POST',
    body: JSON.stringify({ config, auth, backup }),
  })
    .catch((error: Error) => {
      if (error.message !== 'already-initialized') {
        throw error
      }
    })
    .then(() => undefined)
    .finally(() => {
      legacyMigrationAttempted = true
      legacyMigrationPromise = null
    })

  await legacyMigrationPromise
}

export async function fetchPublicConfig() {
  await migrateLegacyStateIfNeeded()
  const payload = await requestJson<{ config: PublicAppConfig }>('/config')
  return sanitizeConfig(payload.config)
}

export function usePublicConfig() {
  const [config, setConfig] = useState<PublicAppConfig>(() => getDefaultPublicConfig())

  useEffect(() => {
    let isActive = true

    const syncConfig = async () => {
      try {
        const nextConfig = await fetchPublicConfig()
        if (isActive) {
          setConfig(nextConfig)
        }
      } catch {
        if (isActive) {
          setConfig(getDefaultPublicConfig())
        }
      }
    }

    void syncConfig()
    window.addEventListener(CONFIG_EVENT, syncConfig)

    return () => {
      isActive = false
      window.removeEventListener(CONFIG_EVENT, syncConfig)
    }
  }, [])

  return config
}

export async function fetchAdminState() {
  await migrateLegacyStateIfNeeded()
  return requestJson<{ initialized: boolean }>('/admin/state')
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
  const payload = await requestJson<{ config: PublicAppConfig }>('/admin/initialize', {
    method: 'POST',
    body: JSON.stringify({ password, config }),
  })

  const savedConfig = sanitizeConfig(payload.config)
  cacheSessionPassword(password)
  emitConfigUpdated()

  return savedConfig
}

export async function unlockAdmin(password: string) {
  const payload = await requestJson<{ ok: boolean }>('/admin/unlock', {
    method: 'POST',
    body: JSON.stringify({ password }),
  })

  if (payload.ok) {
    cacheSessionPassword(password)
  }

  return payload.ok
}

export async function saveAdminConfig(
  config: PublicAppConfig,
  password = getCachedSessionPassword(),
) {
  if (!password) {
    throw new Error('missing-password')
  }

  const payload = await requestJson<{ config: PublicAppConfig }>('/admin/config', {
    method: 'PUT',
    body: JSON.stringify({ password, config }),
  })

  const savedConfig = sanitizeConfig(payload.config)
  emitConfigUpdated()
  return savedConfig
}

export async function restoreFromEncryptedBackup(password = getCachedSessionPassword()) {
  if (!password) {
    throw new Error('missing-password')
  }

  const payload = await requestJson<{ config: PublicAppConfig }>('/admin/restore', {
    method: 'POST',
    body: JSON.stringify({ password }),
  })

  const restoredConfig = sanitizeConfig(payload.config)
  emitConfigUpdated()
  return restoredConfig
}

export async function changeAdminPassword(currentPassword: string, nextPassword: string) {
  await requestJson('/admin/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, nextPassword }),
  })

  cacheSessionPassword(nextPassword)
}

export function buildServiceUrl(service: ServiceItem, host: string) {
  const normalizedHost = host.trim()
  const normalizedPath = normalizePath(service.path)
  return `${service.protocol}://${normalizedHost}:${service.port}${normalizedPath}`
}
