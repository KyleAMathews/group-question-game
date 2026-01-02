import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { tanstackStartCookies } from "better-auth/tanstack-start"
import { db } from "@/db/connection" // your drizzle instance
import * as schema from "@/db/auth-schema"
import { networkInterfaces } from "os"

// Get network IP for trusted origins
const nets = networkInterfaces()
let networkIP = `192.168.1.1` // fallback

for (const name of Object.keys(nets)) {
  const netInterfaces = nets[name]
  if (netInterfaces) {
    for (const net of netInterfaces) {
      if (net.family === `IPv4` && !net.internal) {
        networkIP = net.address
        break
      }
    }
  }
}

// Admin email whitelist from env
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || ``)
  .split(`,`)
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean)

// Helper to check if user is admin
export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false
  return ADMIN_EMAILS.includes(email.toLowerCase())
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: `pg`,
    usePlural: true,
    schema,
    // debugLogs: true,
  }),
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || ``,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || ``,
    },
  },
  emailAndPassword: {
    enabled: true,
    // Disable signup in production, allow in dev
    disableSignUp: process.env.NODE_ENV === `production`,
    minPasswordLength: process.env.NODE_ENV === `production` ? 8 : 1,
  },
  trustedOrigins: [
    `https://buzzin.localhost`,
    `https://${networkIP}`,
    `http://localhost:5173`, // fallback for direct Vite access
  ],
  plugins: [tanstackStartCookies()],
})
