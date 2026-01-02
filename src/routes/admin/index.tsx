import { createFileRoute, Link } from "@tanstack/react-router"
import { useLiveQuery } from "@tanstack/react-db"
import { questionBanksCollection, sessionsCollection, playersCollection } from "@/lib/collections"
import { useMemo } from "react"
import { BookOpen, Gamepad2, Plus, Users, HelpCircle } from "lucide-react"

export const Route = createFileRoute(`/admin/`)({
  component: AdminDashboard,
  loader: async () => {
    await Promise.all([
      questionBanksCollection.preload(),
      sessionsCollection.preload(),
      playersCollection.preload(),
    ])
  },
})

function AdminDashboard() {
  // Load all data via Electric
  const { data: banksData, isLoading: banksLoading } = useLiveQuery((q) =>
    q.from({ banks: questionBanksCollection })
  )
  const banks = banksData || []

  const { data: sessionsData, isLoading: sessionsLoading } = useLiveQuery((q) =>
    q.from({ sessions: sessionsCollection })
  )
  const sessions = sessionsData || []

  const { data: playersData } = useLiveQuery((q) =>
    q.from({ players: playersCollection })
  )
  const players = playersData || []

  // Compute derived data client-side
  const sessionsWithDetails = useMemo(() => {
    return sessions.map((session) => {
      const bank = banks.find((b) => b.id === session.bank_id)
      const sessionPlayers = players.filter((p) => p.session_id === session.id)
      return {
        ...session,
        bankName: bank?.name || null,
        playerCount: sessionPlayers.length,
      }
    })
  }, [sessions, banks, players])

  const isLoading = banksLoading || sessionsLoading

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="spinner" />
      </div>
    )
  }

  const activeSessions = sessionsWithDetails.filter((s) => s.status !== `ended`)
  const totalPlayers = players.length

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-text-dark">Dashboard</h1>
        <p className="text-text-muted mt-1">Welcome to BuzzIn Admin</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card-buzzy">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-buzzy-purple/10 flex items-center justify-center">
              <BookOpen className="w-7 h-7 text-buzzy-purple" />
            </div>
            <div>
              <p className="text-3xl font-bold text-text-dark">{banks.length}</p>
              <p className="text-text-muted">Question Banks</p>
            </div>
          </div>
        </div>

        <div className="card-buzzy">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-buzzy-teal/10 flex items-center justify-center">
              <Gamepad2 className="w-7 h-7 text-buzzy-teal" />
            </div>
            <div>
              <p className="text-3xl font-bold text-text-dark">{activeSessions.length}</p>
              <p className="text-text-muted">Active Sessions</p>
            </div>
          </div>
        </div>

        <div className="card-buzzy">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-buzzy-pink/10 flex items-center justify-center">
              <Users className="w-7 h-7 text-buzzy-pink" />
            </div>
            <div>
              <p className="text-3xl font-bold text-text-dark">{totalPlayers}</p>
              <p className="text-text-muted">Total Players</p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Question Banks */}
        <div className="card-buzzy">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-text-dark">Question Banks</h2>
            <Link to="/admin/banks" className="text-buzzy-purple font-medium text-sm hover:underline">
              View All
            </Link>
          </div>

          {banks.length === 0 ? (
            <div className="text-center py-8">
              <HelpCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-text-muted mb-4">No question banks yet</p>
              <Link to="/admin/banks" className="btn-primary btn-sm">
                <Plus className="w-4 h-4 mr-2" />
                Create Your First Bank
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {banks.slice(0, 3).map((bank) => (
                <Link
                  key={bank.id}
                  to={`/admin/banks/${bank.id}`}
                  className="block p-4 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <p className="font-semibold text-text-dark">{bank.name}</p>
                  {bank.description && (
                    <p className="text-sm text-text-muted mt-1 truncate">{bank.description}</p>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Recent Sessions */}
        <div className="card-buzzy">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-text-dark">Recent Sessions</h2>
            <Link to="/admin/sessions" className="text-buzzy-purple font-medium text-sm hover:underline">
              View All
            </Link>
          </div>

          {sessionsWithDetails.length === 0 ? (
            <div className="text-center py-8">
              <Gamepad2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-text-muted mb-4">No game sessions yet</p>
              <Link to="/admin/sessions/new" className="btn-secondary btn-sm">
                <Plus className="w-4 h-4 mr-2" />
                Start a New Game
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {sessionsWithDetails.slice(0, 3).map((session) => (
                <Link
                  key={session.id}
                  to={`/admin/sessions/${session.id}`}
                  className="block p-4 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-text-dark">/{session.slug}</p>
                      <p className="text-sm text-text-muted">{session.bankName}</p>
                    </div>
                    <span className={`badge-${session.status}`}>
                      {session.status}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Start new game CTA */}
      {banks.length > 0 && (
        <div className="card-buzzy bg-buzzy-gradient text-white">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="text-2xl font-bold">Ready for Game Night?</h3>
              <p className="opacity-90">Start a new trivia session and gather the family!</p>
            </div>
            <Link to="/admin/sessions/new" className="btn-primary whitespace-nowrap">
              <Plus className="w-5 h-5 mr-2" />
              New Game
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
