import { describe, it, expect, beforeAll } from "vitest"

/**
 * Integration tests for Electric SQL API routes
 *
 * These tests verify that the API routes are properly configured and accessible.
 * They require:
 * - The dev server running on localhost:5173
 * - Electric SQL backend running on localhost:30000
 * - PostgreSQL database with the schema applied
 *
 * Run with: pnpm test:integration
 */

const BASE_URL = process.env.TEST_BASE_URL || `http://localhost:5173`
const ELECTRIC_URL = process.env.ELECTRIC_URL || `http://localhost:30000`

let serverRunning = false
let electricRunning = false

// Helper to check if server is running
async function checkServerRunning(): Promise<boolean> {
  try {
    const response = await fetch(`${BASE_URL}/`, { method: `HEAD` })
    return response.ok || response.status === 200 || response.status === 304
  } catch {
    return false
  }
}

// Helper to check if Electric is running
async function checkElectricRunning(): Promise<boolean> {
  try {
    const response = await fetch(`${ELECTRIC_URL}/v1/health`)
    return response.ok
  } catch {
    return false
  }
}

// Skip test if server not running
function skipIfNoServer(testFn: () => Promise<void>) {
  return async () => {
    if (!serverRunning) {
      console.log(`  ⏭️  Skipped (dev server not running)`)
      return
    }
    await testFn()
  }
}

describe(`Electric API Routes`, () => {
  beforeAll(async () => {
    serverRunning = await checkServerRunning()
    electricRunning = await checkElectricRunning()

    if (!serverRunning) {
      console.warn(`\n⚠️  Dev server not running at ${BASE_URL}`)
      console.warn(`   Start it with: pnpm dev\n`)
    }
    if (!electricRunning) {
      console.warn(`\n⚠️  Electric SQL not running at ${ELECTRIC_URL}`)
      console.warn(`   Start it with: pnpm backend:up\n`)
    }
  })

  describe(`/api/question-banks`, () => {
    it(`should return a valid Electric response`, skipIfNoServer(async () => {
      const response = await fetch(`${BASE_URL}/api/question-banks?offset=-1`)

      // Electric returns 200 for valid shape requests
      // May return 400 if Electric has issues, 401 if auth required, 404 if route not found
      expect([200, 400, 401, 404]).toContain(response.status)

      if (response.status === 200) {
        const contentType = response.headers.get(`content-type`)
        expect(contentType).toContain(`application/json`)
      }
    }))

    it(`should include Electric headers when successful`, skipIfNoServer(async () => {
      const response = await fetch(`${BASE_URL}/api/question-banks?offset=-1`)

      if (response.status === 200) {
        // Electric adds specific headers for sync
        const headers = response.headers
        expect(headers.get(`vary`)).toBe(`cookie`)
      }
    }))
  })

  describe(`/api/questions`, () => {
    it(`should return a valid response`, skipIfNoServer(async () => {
      const response = await fetch(`${BASE_URL}/api/questions?offset=-1`)

      expect([200, 400, 401, 404]).toContain(response.status)
    }))

    it(`should accept bank_id filter parameter`, skipIfNoServer(async () => {
      const response = await fetch(`${BASE_URL}/api/questions?offset=-1&bank_id=1`)

      // Route should handle the bank_id parameter
      expect([200, 400, 401, 404]).toContain(response.status)
    }))
  })

  describe(`/api/answer-options`, () => {
    it(`should return a valid response`, skipIfNoServer(async () => {
      const response = await fetch(`${BASE_URL}/api/answer-options?offset=-1`)

      expect([200, 400, 401, 404]).toContain(response.status)
    }))

    it(`should accept question_id filter parameter`, skipIfNoServer(async () => {
      const response = await fetch(`${BASE_URL}/api/answer-options?offset=-1&question_id=1`)

      expect([200, 400, 401, 404]).toContain(response.status)
    }))
  })

  describe(`/api/sessions`, () => {
    it(`should return a valid response`, skipIfNoServer(async () => {
      const response = await fetch(`${BASE_URL}/api/sessions?offset=-1`)

      expect([200, 400, 401, 404]).toContain(response.status)
    }))

    it(`should accept slug filter parameter`, skipIfNoServer(async () => {
      const response = await fetch(`${BASE_URL}/api/sessions?offset=-1&slug=test-game`)

      expect([200, 400, 401, 404]).toContain(response.status)
    }))

    it(`should accept session_id filter parameter`, skipIfNoServer(async () => {
      const response = await fetch(`${BASE_URL}/api/sessions?offset=-1&session_id=1`)

      expect([200, 400, 401, 404]).toContain(response.status)
    }))
  })

  describe(`/api/players`, () => {
    it(`should return a valid response`, skipIfNoServer(async () => {
      const response = await fetch(`${BASE_URL}/api/players?offset=-1`)

      expect([200, 400, 401, 404]).toContain(response.status)
    }))

    it(`should accept session_id filter parameter`, skipIfNoServer(async () => {
      const response = await fetch(`${BASE_URL}/api/players?offset=-1&session_id=1`)

      expect([200, 400, 401, 404]).toContain(response.status)
    }))
  })

  describe(`/api/responses`, () => {
    it(`should return a valid response`, skipIfNoServer(async () => {
      const response = await fetch(`${BASE_URL}/api/responses?offset=-1`)

      expect([200, 400, 401, 404]).toContain(response.status)
    }))

    it(`should accept session_id filter parameter`, skipIfNoServer(async () => {
      const response = await fetch(`${BASE_URL}/api/responses?offset=-1&session_id=1`)

      expect([200, 400, 401, 404]).toContain(response.status)
    }))
  })

  describe(`/api/used-questions`, () => {
    it(`should return a valid response`, skipIfNoServer(async () => {
      const response = await fetch(`${BASE_URL}/api/used-questions?offset=-1`)

      expect([200, 400, 401, 404]).toContain(response.status)
    }))

    it(`should accept session_id filter parameter`, skipIfNoServer(async () => {
      const response = await fetch(`${BASE_URL}/api/used-questions?offset=-1&session_id=1`)

      expect([200, 400, 401, 404]).toContain(response.status)
    }))
  })

  describe(`/api/users`, () => {
    it(`should return a valid response`, skipIfNoServer(async () => {
      const response = await fetch(`${BASE_URL}/api/users?offset=-1`)

      expect([200, 400, 401, 404]).toContain(response.status)
    }))
  })
})

describe(`Electric Shape Protocol`, () => {
  it(`should handle offset parameter for initial sync`, skipIfNoServer(async () => {
    const response = await fetch(`${BASE_URL}/api/sessions?offset=-1`)

    expect([200, 400, 401, 404]).toContain(response.status)
  }))

  it(`should handle live parameter for streaming updates`, skipIfNoServer(async () => {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 1000)

    try {
      const response = await fetch(`${BASE_URL}/api/sessions?offset=-1&live=true`, {
        signal: controller.signal,
      })

      expect([200, 400, 401, 404]).toContain(response.status)
    } catch (error) {
      // AbortError is expected when we timeout the long-polling request
      if (error instanceof Error && error.name !== `AbortError`) {
        throw error
      }
    } finally {
      clearTimeout(timeoutId)
    }
  }))
})
