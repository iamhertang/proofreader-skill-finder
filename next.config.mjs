/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['xlsx', 'better-sqlite3'],
  },
}

export default nextConfig
