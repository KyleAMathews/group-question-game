import { createFileRoute } from "@tanstack/react-router"
import { prepareElectricUrl, proxyElectricRequest } from "@/lib/electric-proxy"

const serve = async ({ request }: { request: Request }) => {
  const url = new URL(request.url)
  const sessionId = url.searchParams.get(`session_id`)
  const questionId = url.searchParams.get(`question_id`)

  const originUrl = prepareElectricUrl(request.url)
  originUrl.searchParams.set(`table`, `player_responses`)

  // Build filter conditions
  const conditions: string[] = []
  if (sessionId) {
    conditions.push(`session_id = ${sessionId}`)
  }
  if (questionId) {
    conditions.push(`question_id = ${questionId}`)
  }

  if (conditions.length > 0) {
    originUrl.searchParams.set(`where`, conditions.join(` AND `))
  }

  return proxyElectricRequest(originUrl)
}

export const Route = createFileRoute(`/api/responses`)({
  server: {
    handlers: {
      GET: serve,
    },
  },
})
