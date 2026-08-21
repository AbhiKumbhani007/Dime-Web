import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface AuthUser {
  id: string
  email: string
  name: string | null
  theme: string
}

interface AuthState {
  user: AuthUser | null
  accessToken: string | null
  setAuth: (user: AuthUser, accessToken: string) => void
  setAccessToken: (token: string) => void
  clearAuth: () => void
  updateUser: (patch: Partial<AuthUser>) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,

      setAuth: (user, accessToken) => set({ user, accessToken }),

      setAccessToken: (accessToken) => set({ accessToken }),

      clearAuth: () => set({ user: null, accessToken: null }),

      updateUser: (patch) =>
        set((s) => ({ user: s.user ? { ...s.user, ...patch } : s.user })),
    }),
    {
      name: 'dime-auth',
      // Only persist the user object — access token is in-memory only
      partialize: (state) => ({ user: state.user }),
    }
  )
)
