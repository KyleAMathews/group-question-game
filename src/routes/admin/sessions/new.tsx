import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useLiveQuery } from "@tanstack/react-db"
import { questionBanksCollection } from "@/lib/collections"
import { trpc } from "@/lib/trpc-client"
import { useEffect, useState } from "react"
import { ArrowLeft, Gamepad2 } from "lucide-react"

export const Route = createFileRoute(`/admin/sessions/new`)({
  component: NewSessionPage,
  loader: async () => {
    await questionBanksCollection.preload()
  },
})

function NewSessionPage() {
  const navigate = useNavigate()

  // Load banks via Electric
  const { data: banksData, isLoading } = useLiveQuery((q) =>
    q.from({ banks: questionBanksCollection })
  )
  const banks = banksData || []

  const [isCreating, setIsCreating] = useState(false)
  const [slug, setSlug] = useState(``)
  const [selectedBankId, setSelectedBankId] = useState<number | null>(null)
  const [roundDuration, setRoundDuration] = useState(30)
  const [error, setError] = useState(``)

  // Set default bank when banks load
  useEffect(() => {
    if (banks.length > 0 && selectedBankId === null) {
      setSelectedBankId(banks[0].id)
    }
  }, [banks, selectedBankId])

  const handleSlugChange = (value: string) => {
    // Only allow lowercase letters, numbers, and hyphens
    const sanitized = value.toLowerCase().replace(/[^a-z0-9-]/g, `-`).replace(/--+/g, `-`)
    setSlug(sanitized)
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedBankId || !slug.trim()) return

    setIsCreating(true)
    setError(``)

    try {
      const result = await trpc.sessions.create.mutate({
        slug,
        bankId: selectedBankId,
        roundDurationSeconds: roundDuration,
      })

      // Navigate to the session control page
      navigate({ to: `/admin/sessions/${result.item.id}` })
    } catch (err: unknown) {
      const error = err as { message?: string }
      setError(error.message || `Failed to create session`)
      setIsCreating(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="spinner" />
      </div>
    )
  }

  if (banks.length === 0) {
    return (
      <div className="max-w-lg mx-auto">
        <div className="card-buzzy text-center py-12">
          <Gamepad2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-text-dark mb-2">No Question Banks</h3>
          <p className="text-text-muted mb-6">
            You need to create a question bank with questions before starting a game.
          </p>
          <a href="/admin/banks" className="btn-primary inline-block">
            Create Question Bank
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto animate-fade-in">
      {/* Back button */}
      <a href="/admin/sessions" className="inline-flex items-center text-text-muted hover:text-buzzy-purple mb-6">
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to Sessions
      </a>

      <div className="card-buzzy">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-full bg-buzzy-gradient mx-auto mb-4 flex items-center justify-center">
            <Gamepad2 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-text-dark">New Game Session</h1>
          <p className="text-text-muted mt-1">Set up a new trivia game</p>
        </div>

        <form onSubmit={handleCreate} className="space-y-6">
          {/* URL Slug */}
          <div>
            <label className="block text-sm font-medium text-text-dark mb-2">
              Game URL
            </label>
            <div className="flex items-center gap-2">
              <span className="text-text-muted">/game/</span>
              <input
                type="text"
                placeholder="family-night"
                value={slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                className="input-buzzy flex-1"
                required
                minLength={1}
                maxLength={100}
              />
            </div>
            <p className="text-xs text-text-muted mt-2">
              This is the link players will use to join. Only lowercase letters, numbers, and hyphens allowed.
            </p>
          </div>

          {/* Question Bank */}
          <div>
            <label className="block text-sm font-medium text-text-dark mb-2">
              Question Bank
            </label>
            <select
              value={selectedBankId || ``}
              onChange={(e) => setSelectedBankId(Number(e.target.value))}
              className="input-buzzy"
              required
            >
              {banks.map((bank) => (
                <option key={bank.id} value={bank.id}>
                  {bank.name}
                </option>
              ))}
            </select>
          </div>

          {/* Round Duration */}
          <div>
            <label className="block text-sm font-medium text-text-dark mb-2">
              Time per Question: {roundDuration} seconds
            </label>
            <input
              type="range"
              min={10}
              max={120}
              step={5}
              value={roundDuration}
              onChange={(e) => setRoundDuration(Number(e.target.value))}
              className="w-full accent-buzzy-purple"
            />
            <div className="flex justify-between text-xs text-text-muted mt-1">
              <span>10s (Fast)</span>
              <span>120s (Relaxed)</span>
            </div>
          </div>

          {error && (
            <div className="p-4 rounded-xl bg-red-50 border-2 border-red-200">
              <p className="text-red-700 text-sm font-medium">{error}</p>
            </div>
          )}

          <button type="submit" disabled={isCreating || !slug.trim()} className="btn-primary w-full">
            {isCreating ? `Creating...` : `Create Game`}
          </button>
        </form>
      </div>
    </div>
  )
}
