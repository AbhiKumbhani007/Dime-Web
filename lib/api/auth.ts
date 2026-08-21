import { api } from '@/lib/api'

export interface User {
  id: string
  email: string
  name: string | null
  theme: string
}

export interface AuthResponse {
  accessToken: string
  refreshToken: string
  user: User
}

export function register(data: {
  email: string
  password: string
  name?: string
}): Promise<AuthResponse> {
  return api.post('api/auth/register', { json: data }).json<AuthResponse>()
}

export function login(data: {
  email: string
  password: string
}): Promise<AuthResponse> {
  return api.post('api/auth/login', { json: data }).json<AuthResponse>()
}

export function refreshToken(data: {
  refreshToken: string
}): Promise<{ accessToken: string; refreshToken: string }> {
  return api
    .post('api/auth/refresh', { json: data })
    .json<{ accessToken: string; refreshToken: string }>()
}

export function logout(data: { refreshToken: string }): Promise<void> {
  return api.post('api/auth/logout', { json: data }).json<void>()
}

export function getMe(): Promise<User> {
  return api.get('api/auth/me').json<User>()
}

export function updateMe(data: { name?: string; theme?: string }): Promise<User> {
  return api.patch('api/auth/me', { json: data }).json<User>()
}

export function updatePassword(data: {
  oldPassword: string
  newPassword: string
}): Promise<void> {
  return api.patch('api/auth/me/password', { json: data }).json<void>()
}

export function deleteAccount(): Promise<void> {
  return api.delete('api/auth/me').json<void>()
}
