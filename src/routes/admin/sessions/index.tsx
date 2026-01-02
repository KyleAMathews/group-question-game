import { createFileRoute, Link } from "@tanstack/react-router"
import { useLiveQuery } from "@tanstack/react-db"
import { sessionsCollection, questionBanksCollection, playersCollection } from "@/lib/collections"
import { trpc } from "@/lib/trpc-client"
import { useMemo } from "react"
import { Plus, Gamepad2, Users, ExternalLink, Trash2 } from "lucide-react"

export const Route = createFileRoute(`/admin/sessions/`)({
  component: SessionsPage,
  loader: async () => {
    await Promise.all([
      sessionsCollection.preload(),
      questionBanksCollection.preload(),
      playersCollection.preload(),
    ])
  },
})

function SessionsPage() {
  // Load all data via Electric
  const { data: sessionsData, isLoading: sessionsLoading } = useLiveQuery((q) =>
    q.from({ sessions: sessionsCollection })
  )

  const { data: banksData } = useLiveQuery((q) =>
    q.from({ banks: questionBanksCollection })
  )
  const banks = banksData || []

  const { data: playersData } = useLiveQuery((q) =>
    q.from({ players: playersCollection })
  )
  const players = playersData || []

  // Compute derived data client-side
  const sessions = useMemo(() => {
    if (!sessionsData) return []
    return sessionsData.map((session) => {
      const bank = banks.find((b) => b.id === session.bank_id)
      const sessionPlayers = players.filter((p) => p.session_id === session.id)
      return {
        ...session,
        bankName: bank?.name || null,
        playerCount: sessionPlayers.length,
      }
    })
  }, [sessionsData, banks, players])

  const isLoading = sessionsLoading

  const handleDelete = async (sessionId: number) => {
    if (!confirm(`Are you sure you want to delete this session?`)) return

    try {
      await trpc.sessions.delete.mutate({ id: sessionId })
      // Electric will sync the deletion
    } catch (error) {
      console.error(`Failed to delete session:`, error)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case `lobby`:
        return <span className="badge-lobby">Lobby</span>
      case `active`:
        return <span className="badge-active">Active</span>
      case `revealing`:
        return <span className="badge-revealing">Revealing</span>
      case `ended`:
        return <span className="badge-ended">Ended</span>
      default:
        return <span className="badge">{status}</span>
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="spinner" />
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-text-dark">Game Sessions</h1>
          <p className="text-text-muted mt-1">Manage your trivia game sessions</p>
        </div>
        <Link to="/admin/sessions/new" className="btn-primary btn-sm inline-flex items-center">
          <Plus className="w-5 h-5 mr-2" />
          New Game
        </Link>
      </div>

      {/* Sessions list */}
      {sessions.length === 0 ? (
        <div className="card-buzzy text-center py-12">
          <Gamepad2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-text-dark mb-2">No Game Sessions</h3>
          <p className="text-text-muted mb-6">
            Start your first game session and invite your family to play!
          </p>
          <Link to="/admin/sessions/new" className="btn-primary inline-block">
            <Plus className="w-5 h-5 mr-2" />
            Start a New Game
          </Link>
        </div>
      ) : (
        <div className="card-buzzy overflow-hidden p-0">
          <table className="table-buzzy">
            <thead>
              <tr>
                <th>Game URL</th>
                <th>Question Bank</th>
                <th>Status</th>
                <th>Players</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr key={session.id}>
                  <td>
                    <Link
                      to={`/admin/sessions/${session.id}`}
                      className="font-semibold text-buzzy-purple hover:underline"
                    >
                      /{session.slug}
                    </Link>
                  </td>
                  <td>{session.bankName || `-`}</td>
                  <td>{getStatusBadge(session.status)}</td>
                  <td>
                    <span className="flex items-center gap-1">
                      <Users className="w-4 h-4 text-text-muted" />
                      {session.playerCount}
                    </span>
                  </td>
                  <td className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <a
                        href={`/game/${session.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-lg hover:bg-gray-100 text-text-muted"
                        title="Open game"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                      {session.status === `ended` && (
                        <button
                          onClick={() => handleDelete(session.id)}
                          className="p-2 rounded-lg hover:bg-red-50 text-red-500"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
