import { createFileRoute } from "@tanstack/react-router"
import { prepareElectricUrl, proxyElectricRequest } from "@/lib/electric-proxy"

const serve = async ({ request }: { request: Request }) => {
  const url = new URL(request.url)
  const slug = url.searchParams.get(`slug`)
  const sessionId = url.searchParams.get(`session_id`)

  const originUrl = prepareElectricUrl(request.url)
  originUrl.searchParams.set(`table`, `game_sessions`)

  // Filter by slug or session_id if provided
  if (slug) {
    originUrl.searchParams.set(`where`, `slug = '${slug}'`)
  } else if (sessionId) {
    originUrl.searchParams.set(`where`, `id = ${sessionId}`)
  }

  return proxyElectricRequest(originUrl)
}

export const Route = createFileRoute(`/api/sessions`)({
  server: {
    handlers: {
      GET: serve,
    },
  },
})
