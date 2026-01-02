import { createFileRoute } from "@tanstack/react-router"
import { prepareElectricUrl, proxyElectricRequest } from "@/lib/electric-proxy"

const serve = async ({ request }: { request: Request }) => {
  const url = new URL(request.url)
  const bankId = url.searchParams.get(`bank_id`)

  const originUrl = prepareElectricUrl(request.url)
  originUrl.searchParams.set(`table`, `questions`)

  // Filter by bank_id if provided
  if (bankId) {
    originUrl.searchParams.set(`where`, `bank_id = ${bankId}`)
  }

  return proxyElectricRequest(originUrl)
}

export const Route = createFileRoute(`/api/questions`)({
  server: {
    handlers: {
      GET: serve,
    },
  },
})
