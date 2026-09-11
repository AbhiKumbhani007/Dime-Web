import 'server-only'
import { z } from 'zod'

export const RegisterBodySchema = z.object({
  email: z.email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().optional(),
})

export const LoginBodySchema = z.object({
  email: z.email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
})

export const RefreshBodySchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
})

export const LogoutBodySchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
})

export const UpdateMeBodySchema = z.object({
  name: z.string().optional(),
  theme: z.string().optional(),
})

export const UpdatePasswordBodySchema = z.object({
  oldPassword: z.string().min(1, 'Old password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
})

export const GoogleAuthBodySchema = z.object({
  idToken: z.string().min(1, 'ID token is required'),
})

export type RegisterBody = z.infer<typeof RegisterBodySchema>
export type LoginBody = z.infer<typeof LoginBodySchema>
export type RefreshBody = z.infer<typeof RefreshBodySchema>
export type LogoutBody = z.infer<typeof LogoutBodySchema>
export type UpdateMeBody = z.infer<typeof UpdateMeBodySchema>
export type UpdatePasswordBody = z.infer<typeof UpdatePasswordBodySchema>
export type GoogleAuthBody = z.infer<typeof GoogleAuthBodySchema>
