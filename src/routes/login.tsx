import * as React from "react"
import { createFileRoute } from "@tanstack/react-router"
import { authClient, signInWithGoogle } from "@/lib/auth-client"
import { useState } from "react"
import { Zap } from "lucide-react"

export const Route = createFileRoute(`/login`)({
  component: LoginPage,
  ssr: false,
})

function LoginPage() {
  const [email, setEmail] = useState(``)
  const [password, setPassword] = useState(``)
  const [isLoading, setIsLoading] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [error, setError] = useState(``)

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true)
    setError(``)
    try {
      await signInWithGoogle()
    } catch (err) {
      console.error(`Google sign-in error:`, err)
      setError(`Google sign-in failed`)
      setIsGoogleLoading(false)
    }
  }

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(``)

    try {
      let { data: _data, error } = await authClient.signUp.email(
        {
          email,
          password,
          name: email,
        },
        {
          onSuccess: () => {
            window.location.href = `/`
          },
        }
      )

      if (error?.code === `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL`) {
        const result = await authClient.signIn.email(
          {
            email,
            password,
          },
          {
            onSuccess: async () => {
              await authClient.getSession()
              window.location.href = `/`
            },
          }
        )

        _data = result.data
        error = result.error
      }

      if (error) {
        console.error(`Authentication error:`, error)
        setError(error.message || `Authentication failed`)
      }
    } catch (err) {
      console.error(`Unexpected error:`, err)
      setError(`An unexpected error occurred`)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-buzzy-gradient flex items-center justify-center p-4">
      <div className="card-buzzy max-w-md w-full animate-bounce-in">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-buzzy-gradient mb-4">
            <Zap className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-text-dark">BuzzIn</h1>
          <p className="text-text-muted mt-2">Admin Login</p>
        </div>

        {/* Google Sign In */}
        <button
          onClick={handleGoogleSignIn}
          disabled={isGoogleLoading}
          className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-2xl font-bold text-lg bg-white border-4 border-gray-200 text-text-dark hover:border-buzzy-purple transition-all duration-200 disabled:opacity-50 mb-6"
        >
          {isGoogleLoading ? (
            <div className="spinner" />
          ) : (
            <>
              <svg className="w-6 h-6" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Sign in with Google
            </>
          )}
        </button>

        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t-2 border-gray-200" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-white px-4 text-text-muted text-sm">
              or continue with email
            </span>
          </div>
        </div>

        {/* Email/Password Form (for development) */}
        <form onSubmit={handleEmailSubmit} className="space-y-4">
          <div>
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-buzzy"
              required
            />
          </div>
          <div>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-buzzy"
              required
            />
          </div>

          {error && (
            <div className="p-4 rounded-xl bg-red-50 border-2 border-red-200">
              <p className="text-red-700 text-sm font-medium">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="btn-purple w-full"
          >
            {isLoading ? `Signing in...` : `Sign in`}
          </button>
        </form>

        {process.env.NODE_ENV !== `production` && (
          <div className="mt-6 p-4 rounded-xl bg-buzzy-blue/10 border-2 border-buzzy-blue/20">
            <p className="text-sm text-buzzy-blue font-medium">
              Dev Mode: Any email/password works. New accounts auto-created.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
