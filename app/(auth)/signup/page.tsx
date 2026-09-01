'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { AuthLayout } from '@/components/auth/AuthLayout'
import {
  AuthError,
  AuthField,
  PasswordField,
  PasswordStrength,
} from '@/components/auth/AuthFields'
import { AuthSubmit, GoogleButton, AuthSwitch } from '@/components/auth/AuthActions'
import { register as registerApi } from '@/lib/api/auth'
import { useAuthStore } from '@/store/useAuthStore'

const signupSchema = z
  .object({
    name: z.string().optional(),
    email: z.string().email('Please enter a valid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(8, 'Password must be at least 8 characters'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

type SignupFormValues = z.infer<typeof signupSchema>

export default function SignupPage() {
  const router = useRouter()
  const { setAuth } = useAuthStore()
  const [apiError, setApiError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { name: '', email: '', password: '', confirmPassword: '' },
  })

  // useWatch rather than watch(): it subscribes to the single field instead of
  // re-rendering the whole form on every keystroke, and unlike watch() it does
  // not opt this component out of the React Compiler.
  const password = useWatch({ control, name: 'password' }) ?? ''

  async function onSubmit(values: SignupFormValues) {
    setApiError(null)
    try {
      const { user, accessToken, refreshToken } = await registerApi({
        email: values.email,
        password: values.password,
        name: values.name || undefined,
      })
      setAuth(user, accessToken)
      localStorage.setItem('dime-refresh-token', refreshToken)
      router.push('/log')
    } catch {
      setApiError('Something went wrong. Please try again.')
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Free, and your data exports as CSV whenever you want."
    >
      {apiError && <AuthError message={apiError} />}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
        <div className="flex flex-col gap-3">
          <AuthField
            id="name"
            label="Name"
            placeholder="Abhi Kumbhani"
            autoComplete="name"
            error={errors.name?.message}
            {...register('name')}
          />

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
            autoComplete="new-password"
            error={errors.password?.message}
            {...register('password')}
          >
            <PasswordStrength password={password} />
          </PasswordField>

          <PasswordField
            id="confirmPassword"
            label="Confirm password"
            placeholder="Repeat your password"
            autoComplete="new-password"
            error={errors.confirmPassword?.message}
            {...register('confirmPassword')}
          />
        </div>

        <AuthSubmit busy={isSubmitting} label="Create account" busyLabel="Creating account…" />
      </form>

      <GoogleButton />

      <AuthSwitch prompt="Already have an account?" href="/login" label="Sign in" />
    </AuthLayout>
  )
}
