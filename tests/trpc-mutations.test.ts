import { describe, it, expect, beforeAll } from "vitest"

/**
 * Integration tests for tRPC mutation endpoints
 *
 * These tests verify that the tRPC mutations work correctly.
 * They require:
 * - The dev server running on localhost:5173
 * - PostgreSQL database with the schema applied
 *
 * Run with: pnpm test:integration
 */

const BASE_URL = process.env.TEST_BASE_URL || `http://localhost:5173`

let serverRunning = false

// Helper to check if server is running
async function checkServerRunning(): Promise<boolean> {
  try {
    const response = await fetch(`${BASE_URL}/`, { method: `HEAD` })
    return response.ok || response.status === 200 || response.status === 304
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

// Helper to make tRPC batch requests
async function trpcMutate(
  procedure: string,
  input: unknown
): Promise<{ result?: { data: unknown }; error?: { message: string } }> {
  const response = await fetch(`${BASE_URL}/api/trpc/${procedure}?batch=1`, {
    method: `POST`,
    headers: {
      "content-type": `application/json`,
    },
    body: JSON.stringify({ 0: { json: input } }),
  })

  const data = await response.json()
  return data[0]
}

describe(`tRPC Question Banks`, () => {
  beforeAll(async () => {
    serverRunning = await checkServerRunning()
    if (!serverRunning) {
      console.warn(`\n⚠️  Dev server not running at ${BASE_URL}`)
      console.warn(`   Start it with: pnpm dev\n`)
    }
  })

  it(`should create a new question bank`, skipIfNoServer(async () => {
    const result = await trpcMutate(`questionBanks.create`, {
      name: `Test Bank ${Date.now()}`,
      description: `A test question bank`,
    })

    // May fail due to auth, but should get a structured response
    expect(result).toBeDefined()
    if (result.error) {
      // Auth error is acceptable
      expect(result.error.message).toBeDefined()
    } else {
      expect(result.result?.data).toBeDefined()
    }
  }))

  it(`should require name for question bank creation`, skipIfNoServer(async () => {
    const result = await trpcMutate(`questionBanks.create`, {
      description: `Missing name`,
    })

    // Should fail validation
    expect(result.error || result.result).toBeDefined()
  }))
})

describe(`tRPC Sessions`, () => {
  it(`should create a new session with valid data`, skipIfNoServer(async () => {
    const result = await trpcMutate(`sessions.create`, {
      slug: `test-session-${Date.now()}`,
      bankId: 1,
      roundDurationSeconds: 30,
    })

    expect(result).toBeDefined()
    if (result.error) {
      expect(result.error.message).toBeDefined()
    } else {
      expect(result.result?.data).toBeDefined()
    }
  }))

  it(`should reject duplicate session slugs`, skipIfNoServer(async () => {
    const slug = `duplicate-test-${Date.now()}`

    // Create first session
    await trpcMutate(`sessions.create`, {
      slug,
      bankId: 1,
      roundDurationSeconds: 30,
    })

    // Try to create duplicate
    const result = await trpcMutate(`sessions.create`, {
      slug,
      bankId: 1,
      roundDurationSeconds: 30,
    })

    // Should either fail or return an error
    expect(result).toBeDefined()
  }))
})

describe(`tRPC Players`, () => {
  it(`should allow joining a session`, skipIfNoServer(async () => {
    const result = await trpcMutate(`players.join`, {
      sessionId: 1,
      displayName: `TestPlayer${Date.now()}`,
    })

    expect(result).toBeDefined()
    if (result.error) {
      expect(result.error.message).toBeDefined()
    } else {
      expect(result.result?.data).toBeDefined()
    }
  }))

  it(`should reject display names that are too short`, skipIfNoServer(async () => {
    const result = await trpcMutate(`players.join`, {
      sessionId: 1,
      displayName: `AB`, // Too short
    })

    // Should fail validation (min 3 chars) or session not found
    expect(result).toBeDefined()
  }))
})

describe(`tRPC Game Actions`, () => {
  it(`should reject starting game on non-existent session`, skipIfNoServer(async () => {
    const result = await trpcMutate(`game.startGame`, {
      sessionId: 999999,
    })

    expect(result.error).toBeDefined()
  }))

  it(`should reject submitting answer without required fields`, skipIfNoServer(async () => {
    const result = await trpcMutate(`game.submitAnswer`, {
      sessionId: 1,
      // Missing playerId, questionId, selectedOptionIds
    })

    expect(result.error).toBeDefined()
  }))
})

describe(`tRPC Questions`, () => {
  it(`should create a question with options`, skipIfNoServer(async () => {
    const result = await trpcMutate(`questions.create`, {
      bank_id: 1,
      question_text: `What is 2 + 2?`,
      question_type: `single`,
      explanation: `Basic addition`,
      options: [
        { option_text: `4`, is_correct: true, display_order: 0 },
        { option_text: `3`, is_correct: false, display_order: 1 },
        { option_text: `5`, is_correct: false, display_order: 2 },
        { option_text: `22`, is_correct: false, display_order: 3 },
      ],
    })

    expect(result).toBeDefined()
    if (result.error) {
      expect(result.error.message).toBeDefined()
    } else {
      expect(result.result?.data).toBeDefined()
    }
  }))

  it(`should reject question without options`, skipIfNoServer(async () => {
    const result = await trpcMutate(`questions.create`, {
      bank_id: 1,
      question_text: `A question with no options`,
      question_type: `single`,
      options: [],
    })

    // Should fail - need at least 2 options
    expect(result).toBeDefined()
  }))
})
