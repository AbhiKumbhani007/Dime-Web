'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { AuthLayout } from '@/components/auth/AuthLayout'
import { AuthError, AuthField, PasswordField } from '@/components/auth/AuthFields'
import { AuthSubmit, GoogleButton, AuthSwitch } from '@/components/auth/AuthActions'
import { login } from '@/lib/api/auth'
import { useAuthStore } from '@/store/useAuthStore'

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

type LoginFormValues = z.infer<typeof loginSchema>

export default function LoginPage() {
  const router = useRouter()
  const { setAuth } = useAuthStore()
  const [apiError, setApiError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  async function onSubmit(values: LoginFormValues) {
    setApiError(null)
    try {
      const { user, accessToken, refreshToken } = await login(values)
      setAuth(user, accessToken)
      localStorage.setItem('dime-refresh-token', refreshToken)
      router.push('/log')
    } catch {
      setApiError('Invalid email or password. Please try again.')
    }
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to pick up where you left off.">
      {apiError && <AuthError message={apiError} />}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
        <div className="flex flex-col gap-3">
          <AuthField
            id="email"
            type="email"
            label="Email"
            placeholder="you@example.com"
            autoComplete="email"
            error={errors.email?.message}
            {...register('email')}
          />

          <PasswordField
            id="password"
            label="Password"
            placeholder="At least 8 characters"
            autoComplete="current-password"
            error={errors.password?.message}
            {...register('password')}
          />
        </div>

        <AuthSubmit busy={isSubmitting} label="Sign in" busyLabel="Signing in…" />
      </form>

      <GoogleButton />

      <AuthSwitch prompt="Don't have an account?" href="/signup" label="Sign up" />
    </AuthLayout>
  )
}
