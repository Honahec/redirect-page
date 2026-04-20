export type ServiceProtocol = 'http' | 'https'

export type ServiceItem = {
  id: string
  name: string
  description: string
  port: string
  path: string
  protocol: ServiceProtocol
  category: string
  lanEnabled: boolean
}

export type PublicAppConfig = {
  siteTitle: string
  siteDescription: string
  lanIpv4: string
  services: ServiceItem[]
  updatedAt: string
}

export type PasswordVerifier = {
  version: 1
  salt: string
  hash: string
  iterations: number
}

export type EncryptedBackup = {
  version: 1
  salt: string
  iv: string
  data: string
}
