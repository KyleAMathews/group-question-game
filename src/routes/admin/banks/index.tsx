import { createFileRoute, Link } from "@tanstack/react-router"
import { useLiveQuery } from "@tanstack/react-db"
import { questionBanksCollection, questionsCollection } from "@/lib/collections"
import { useState, useMemo } from "react"
import { Plus, BookOpen, Trash2, HelpCircle } from "lucide-react"

// Temp ID counter for optimistic inserts (negative to avoid conflicts with real IDs)
let tempIdCounter = -1

export const Route = createFileRoute(`/admin/banks/`)({
  component: BanksPage,
  loader: async () => {
    await Promise.all([
      questionBanksCollection.preload(),
      questionsCollection.preload(),
    ])
  },
})

function BanksPage() {
  // Use Electric SQL live query for real-time sync
  const { data: banks, isLoading: banksLoading } = useLiveQuery((q) =>
    q.from({ banks: questionBanksCollection })
  )

  // Load all questions via Electric to compute counts
  const { data: questions, isLoading: questionsLoading } = useLiveQuery((q) =>
    q.from({ questions: questionsCollection })
  )

  // Compute question counts per bank client-side
  const questionCounts = useMemo(() => {
    if (!questions) return {}
    const counts: Record<number, number> = {}
    for (const q of questions) {
      counts[q.bank_id] = (counts[q.bank_id] || 0) + 1
    }
    return counts
  }, [questions])

  const isLoading = banksLoading || questionsLoading

  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newBankName, setNewBankName] = useState(``)
  const [newBankDescription, setNewBankDescription] = useState(``)
  const [isCreating, setIsCreating] = useState(false)

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newBankName.trim()) return

    setIsCreating(true)
    try {
      // Use collection.insert() for optimistic update
      // The onInsert handler will call tRPC and return { txid }
      const now = new Date()
      questionBanksCollection.insert({
        id: tempIdCounter--, // Temp ID, server assigns real ID
        name: newBankName,
        description: newBankDescription || null,
        created_at: now,
        updated_at: now,
      })
      setNewBankName(``)
      setNewBankDescription(``)
      setShowCreateForm(false)
    } catch (error) {
      console.error(`Failed to create bank:`, error)
    } finally {
      setIsCreating(false)
    }
  }

  const handleDelete = async (bankId: number) => {
    if (!confirm(`Are you sure? This will delete all questions in this bank.`)) return

    try {
      // Use collection.delete() for optimistic update
      // The onDelete handler will call tRPC and return { txid }
      questionBanksCollection.delete(bankId)
    } catch (error) {
      console.error(`Failed to delete bank:`, error)
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
          <h1 className="text-3xl font-bold text-text-dark">Question Banks</h1>
          <p className="text-text-muted mt-1">Organize your trivia questions by theme</p>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="btn-primary btn-sm inline-flex items-center"
        >
          <Plus className="w-5 h-5 mr-2" />
          New Bank
        </button>
      </div>

      {/* Create form */}
      {showCreateForm && (
        <div className="card-buzzy animate-slide-down">
          <h3 className="text-xl font-bold text-text-dark mb-4">Create Question Bank</h3>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-dark mb-2">
                Name
              </label>
              <input
                type="text"
                placeholder="e.g., Movie Trivia, Family History"
                value={newBankName}
                onChange={(e) => setNewBankName(e.target.value)}
                className="input-buzzy"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-dark mb-2">
                Description (optional)
              </label>
              <textarea
                placeholder="A brief description of this question bank"
                value={newBankDescription}
                onChange={(e) => setNewBankDescription(e.target.value)}
                className="input-buzzy min-h-[100px]"
              />
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={isCreating} className="btn-primary btn-sm">
                {isCreating ? `Creating...` : `Create Bank`}
              </button>
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="btn-sm px-4 py-2 rounded-xl font-bold text-text-muted hover:bg-gray-100"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Banks list */}
      {!banks || banks.length === 0 ? (
        <div className="card-buzzy text-center py-12">
          <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-text-dark mb-2">No Question Banks Yet</h3>
          <p className="text-text-muted mb-6">
            Create your first question bank to start adding trivia questions.
          </p>
          <button
            onClick={() => setShowCreateForm(true)}
            className="btn-primary"
          >
            <Plus className="w-5 h-5 mr-2" />
            Create Your First Bank
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {banks.map((bank) => (
            <div key={bank.id} className="card-buzzy-hover group">
              <div className="flex items-start justify-between mb-3">
                <div className="w-12 h-12 rounded-xl bg-buzzy-purple/10 flex items-center justify-center">
                  <BookOpen className="w-6 h-6 text-buzzy-purple" />
                </div>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                  <button
                    onClick={() => handleDelete(bank.id)}
                    className="p-2 rounded-lg hover:bg-red-50 text-red-500"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <Link to={`/admin/banks/${bank.id}`} className="block">
                <h3 className="text-lg font-bold text-text-dark group-hover:text-buzzy-purple transition-colors">
                  {bank.name}
                </h3>
                {bank.description && (
                  <p className="text-text-muted text-sm mt-1 line-clamp-2">
                    {bank.description}
                  </p>
                )}
                <div className="mt-4 flex items-center gap-4 text-sm text-text-muted">
                  <span className="flex items-center gap-1">
                    <HelpCircle className="w-4 h-4" />
                    {questionCounts[bank.id] || 0} questions
                  </span>
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
