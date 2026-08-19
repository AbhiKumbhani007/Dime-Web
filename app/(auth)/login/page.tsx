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
  const [googleLoading, setGoogleLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: 'abhi1234kumbhani@gmail.com',
      password: 'Password',
    },
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

  function handleGoogleClick() {
    setGoogleLoading(true)
    // Show coming soon toast (using a simple alert for now)
    setTimeout(() => {
      setGoogleLoading(false)
      alert('Coming soon')
    }, 300)
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
              autoComplete="current-password"
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

          <Button
            type="submit"
            className="w-full"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Signing in…
              </>
            ) : (
              'Sign in'
            )}
          </Button>
        </form>

        {/* Divider */}
        <div className="my-4 flex items-center gap-3">
          <span className="h-px flex-1 bg-[var(--border)]" />
          <span className="text-xs text-[var(--muted-foreground)]">or</span>
          <span className="h-px flex-1 bg-[var(--border)]" />
        </div>

        {/* Google */}
        <Button
          variant="outline"
          className="w-full border-[var(--border)] text-[var(--foreground)]"
          onClick={handleGoogleClick}
          disabled={googleLoading}
          type="button"
        >
          {googleLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
          )}
          Continue with Google
        </Button>

        {/* Footer link */}
        <p className="mt-6 text-center text-sm text-[var(--muted-foreground)]">
          Don&apos;t have an account?{' '}
          <Link
            href="/signup"
            className="font-medium text-[var(--accent)] hover:underline"
          >
            Sign up
          </Link>
        </p>
      </div>
    </main>
  )
}
