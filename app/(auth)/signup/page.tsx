'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
    formState: { errors, isSubmitting },
  } = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
  })

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
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-[var(--background)]">
      <div className="w-full max-w-sm mx-auto mt-8 p-8 rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-sm">
        {/* Brand */}
        <div className="mb-8 text-center">
          <h1 className="font-bold text-3xl text-[var(--foreground)]">Dime</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">Your money, simplified</p>
        </div>

        {/* API Error */}
        {apiError && (
          <div className="mb-4 rounded-lg bg-[var(--destructive)]/10 border border-[var(--destructive)]/20 px-4 py-3 text-sm text-[var(--destructive)]">
            {apiError}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div className="space-y-1">
            <label
              htmlFor="name"
              className="text-sm font-medium text-[var(--foreground)]"
            >
              Name <span className="text-[var(--muted-foreground)]">(optional)</span>
            </label>
            <Input
              id="name"
              type="text"
              placeholder="Jane Doe"
              autoComplete="name"
              {...register('name')}
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="email"
              className="text-sm font-medium text-[var(--foreground)]"
            >
              Email
            </label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              {...register('email')}
              className={
                errors.email
                  ? 'border-[var(--destructive)] focus-visible:ring-[var(--destructive)]'
                  : ''
              }
            />
            {errors.email && (
              <p className="text-xs text-[var(--destructive)]">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <label
              htmlFor="password"
              className="text-sm font-medium text-[var(--foreground)]"
            >
              Password
            </label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              autoComplete="new-password"
              {...register('password')}
              className={
                errors.password
                  ? 'border-[var(--destructive)] focus-visible:ring-[var(--destructive)]'
                  : ''
              }
            />
            {errors.password && (
              <p className="text-xs text-[var(--destructive)]">{errors.password.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <label
              htmlFor="confirmPassword"
              className="text-sm font-medium text-[var(--foreground)]"
            >
              Confirm Password
            </label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="••••••••"
              autoComplete="new-password"
              {...register('confirmPassword')}
              className={
                errors.confirmPassword
                  ? 'border-[var(--destructive)] focus-visible:ring-[var(--destructive)]'
                  : ''
              }
            />
            {errors.confirmPassword && (
              <p className="text-xs text-[var(--destructive)]">{errors.confirmPassword.message}</p>
            )}
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating account…
              </>
            ) : (
              'Create account'
            )}
          </Button>
        </form>

        {/* Footer link */}
        <p className="mt-6 text-center text-sm text-[var(--muted-foreground)]">
          Already have an account?{' '}
          <Link
            href="/login"
            className="font-medium text-[var(--accent)] hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </main>
  )
}
