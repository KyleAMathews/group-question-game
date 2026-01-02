import { createFileRoute } from "@tanstack/react-router"
import { prepareElectricUrl, proxyElectricRequest } from "@/lib/electric-proxy"

const serve = async ({ request }: { request: Request }) => {
  const url = new URL(request.url)
  const questionId = url.searchParams.get(`question_id`)

  const originUrl = prepareElectricUrl(request.url)
  originUrl.searchParams.set(`table`, `answer_options`)

  // Filter by question_id if provided
  if (questionId) {
    originUrl.searchParams.set(`where`, `question_id = ${questionId}`)
  }

  return proxyElectricRequest(originUrl)
}

export const Route = createFileRoute(`/api/answer-options`)({
  server: {
    handlers: {
      GET: serve,
    },
  },
})
