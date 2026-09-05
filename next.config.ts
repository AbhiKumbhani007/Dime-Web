import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Kuberns' exact health-check path convention is unconfirmed (see
  // phases/001-merge-backend-into-nextjs/tdd.md's open question #1) — this
  // rewrite makes /api/health reachable at the bare /health path too, so
  // either convention works without guessing which one deploy health
  // checks will actually hit.
  async rewrites() {
    return [{ source: '/health', destination: '/api/health' }]
  },
}

export default nextConfig
