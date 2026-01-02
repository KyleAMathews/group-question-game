import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { prepareElectricUrl } from "./electric-proxy"

describe(`prepareElectricUrl`, () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
    delete process.env.ELECTRIC_URL
    delete process.env.ELECTRIC_SOURCE_ID
    delete process.env.ELECTRIC_SECRET
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it(`should use default Electric URL when env var is not set`, () => {
    const result = prepareElectricUrl(`http://localhost:5173/api/test?offset=-1`)

    expect(result.origin).toBe(`http://localhost:30000`)
    expect(result.pathname).toBe(`/v1/shape`)
  })

  it(`should use ELECTRIC_URL env var when set`, async () => {
    process.env.ELECTRIC_URL = `http://custom-electric:3000`

    // Re-import to pick up new env
    const { prepareElectricUrl: freshPrepare } = await import(`./electric-proxy`)
    const result = freshPrepare(`http://localhost:5173/api/test?offset=-1`)

    expect(result.origin).toBe(`http://custom-electric:3000`)
  })

  it(`should copy Electric protocol query params`, () => {
    const result = prepareElectricUrl(
      `http://localhost:5173/api/test?offset=-1&handle=abc123&live=true`
    )

    expect(result.searchParams.get(`offset`)).toBe(`-1`)
    expect(result.searchParams.get(`handle`)).toBe(`abc123`)
    expect(result.searchParams.get(`live`)).toBe(`true`)
  })

  it(`should not copy non-Electric query params`, () => {
    const result = prepareElectricUrl(
      `http://localhost:5173/api/test?offset=-1&customParam=value`
    )

    expect(result.searchParams.get(`offset`)).toBe(`-1`)
    expect(result.searchParams.has(`customParam`)).toBe(false)
  })

  it(`should add Electric Cloud auth when configured`, async () => {
    process.env.ELECTRIC_SOURCE_ID = `test-source-id`
    process.env.ELECTRIC_SECRET = `test-secret`

    const { prepareElectricUrl: freshPrepare } = await import(`./electric-proxy`)
    const result = freshPrepare(`http://localhost:5173/api/test?offset=-1`)

    expect(result.searchParams.get(`source_id`)).toBe(`test-source-id`)
    expect(result.searchParams.get(`secret`)).toBe(`test-secret`)
  })

  it(`should not add auth params when not configured`, () => {
    const result = prepareElectricUrl(`http://localhost:5173/api/test?offset=-1`)

    expect(result.searchParams.has(`source_id`)).toBe(false)
    expect(result.searchParams.has(`secret`)).toBe(false)
  })
})
