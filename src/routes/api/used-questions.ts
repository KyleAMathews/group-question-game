import { createFileRoute } from "@tanstack/react-router"
import { prepareElectricUrl, proxyElectricRequest } from "@/lib/electric-proxy"

const serve = async ({ request }: { request: Request }) => {
  const url = new URL(request.url)
  const sessionId = url.searchParams.get(`session_id`)

  const originUrl = prepareElectricUrl(request.url)
  originUrl.searchParams.set(`table`, `used_questions`)

  // Filter by session_id if provided
  if (sessionId) {
    originUrl.searchParams.set(`where`, `session_id = ${sessionId}`)
  }

  return proxyElectricRequest(originUrl)
}

export const Route = createFileRoute(`/api/used-questions`)({
  server: {
    handlers: {
      GET: serve,
    },
  },
})
