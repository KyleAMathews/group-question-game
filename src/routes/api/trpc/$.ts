import { createFileRoute } from "@tanstack/react-router"
import { fetchRequestHandler } from "@trpc/server/adapters/fetch"
import { router } from "@/lib/trpc"
import { questionBanksRouter } from "@/lib/trpc/question-banks"
import { questionsRouter } from "@/lib/trpc/questions"
import { sessionsRouter } from "@/lib/trpc/sessions"
import { playersRouter } from "@/lib/trpc/players"
import { gameRouter } from "@/lib/trpc/game"
import { db } from "@/db/connection"
import { auth } from "@/lib/auth"

export const appRouter = router({
  questionBanks: questionBanksRouter,
  questions: questionsRouter,
  sessions: sessionsRouter,
  players: playersRouter,
  game: gameRouter,
})

export type AppRouter = typeof appRouter

const serve = ({ request }: { request: Request }) => {
  return fetchRequestHandler({
    endpoint: `/api/trpc`,
    req: request,
    router: appRouter,
    createContext: async () => ({
      db,
      session: await auth.api.getSession({ headers: request.headers }),
    }),
  })
}

export const Route = createFileRoute(`/api/trpc/$`)({
  server: {
    handlers: {
      GET: serve,
      POST: serve,
    },
  },
})
