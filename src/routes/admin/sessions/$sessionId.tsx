import { createFileRoute } from "@tanstack/react-router"
import { useLiveQuery, eq } from "@tanstack/react-db"
import {
  sessionsCollection,
  playersCollection,
  questionBanksCollection,
  questionsCollection,
  answerOptionsCollection,
  usedQuestionsCollection,
  responsesCollection,
} from "@/lib/collections"
import { trpc } from "@/lib/trpc-client"
import { useMemo, useState } from "react"
import { QRCodeSVG } from "qrcode.react"
import {
  ArrowLeft,
  Play,
  SkipForward,
  Eye,
  Square,
  Users,
  Copy,
  Check,
  Crown,
  Trophy,
} from "lucide-react"

interface SessionData {
  id: number
  slug: string
  status: string
  current_question_id: number | null
  round_started_at: string | null
  round_duration_seconds: number
  winner_player_id: string | null
  bank_id: number
}

interface PlayerData {
  id: string
  session_id: number
  display_name: string
  score: number
  is_connected: boolean
}

interface QuestionData {
  id: number
  question_text: string
  question_type: string
  options: { id: number; option_text: string; is_correct: boolean }[]
}

export const Route = createFileRoute(`/admin/sessions/$sessionId`)({
  component: SessionControlPage,
  loader: async () => {
    await Promise.all([
      sessionsCollection.preload(),
      playersCollection.preload(),
      questionBanksCollection.preload(),
      questionsCollection.preload(),
      answerOptionsCollection.preload(),
      usedQuestionsCollection.preload(),
      responsesCollection.preload(),
    ])
  },
})

function SessionControlPage() {
  const { sessionId: sessionIdParam } = Route.useParams()

  // Real-time session sync via Electric SQL
  const { data: sessionsData, isLoading: sessionsLoading } = useLiveQuery((q) =>
    q.from({ sessions: sessionsCollection })
      .where(({ sessions }) => eq(sessions.id, Number(sessionIdParam)))
  )
  const session = sessionsData?.[0] as SessionData | undefined

  const sessionId = session?.id ?? -1
  const bankId = session?.bank_id ?? -1

  // Real-time players sync via Electric SQL
  const { data: playersData } = useLiveQuery((q) =>
    q.from({ players: playersCollection })
      .where(({ players }) => eq(players.session_id, sessionId))
  )
  const players = (playersData || []) as PlayerData[]

  // Load bank name via Electric
  const { data: banksData } = useLiveQuery((q) =>
    q.from({ banks: questionBanksCollection })
      .where(({ banks }) => eq(banks.id, bankId))
  )
  const bankName = banksData?.[0]?.name || null

  // Load all questions for this bank via Electric
  const { data: questionsData } = useLiveQuery((q) =>
    q.from({ questions: questionsCollection })
      .where(({ questions }) => eq(questions.bank_id, bankId))
  )
  const allQuestions = questionsData || []

  // Load all answer options via Electric
  const { data: optionsData } = useLiveQuery((q) =>
    q.from({ options: answerOptionsCollection })
  )
  const allOptions = optionsData || []

  // Load used questions for this session via Electric
  const { data: usedQuestionsData } = useLiveQuery((q) =>
    q.from({ usedQuestions: usedQuestionsCollection })
      .where(({ usedQuestions }) => eq(usedQuestions.session_id, sessionId))
  )
  const usedQuestions = usedQuestionsData || []

  // Load responses for this session via Electric (for round stats)
  const { data: responsesData } = useLiveQuery((q) =>
    q.from({ responses: responsesCollection })
      .where(({ responses }) => eq(responses.session_id, sessionId))
  )
  const responses = responsesData || []

  // Compute current question with options
  const currentQuestion: QuestionData | null = useMemo(() => {
    if (!session?.current_question_id) return null
    const question = allQuestions.find((q) => q.id === session.current_question_id)
    if (!question) return null
    const options = allOptions
      .filter((o) => o.question_id === question.id)
      .sort((a, b) => a.display_order - b.display_order)
    return { ...question, options }
  }, [session?.current_question_id, allQuestions, allOptions])

  // Compute questions remaining
  const questionsRemaining = useMemo(() => {
    const total = allQuestions.length
    const used = usedQuestions.length
    return { total, used, remaining: total - used }
  }, [allQuestions.length, usedQuestions.length])

  // Compute round stats from responses
  const roundStats = useMemo(() => {
    if (session?.status !== `revealing` || !session.current_question_id) return null
    const questionResponses = responses.filter((r) => r.question_id === session.current_question_id)
    if (questionResponses.length === 0) return { percentCorrect: 0 }
    const correctCount = questionResponses.filter((r) => r.points_earned > 0).length
    return { percentCorrect: Math.round((correctCount / questionResponses.length) * 100) }
  }, [session?.status, session?.current_question_id, responses])

  const [isActionLoading, setIsActionLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const gameUrl = typeof window !== `undefined` ? `${window.location.origin}/game/${session?.slug}` : ``

  const handleStartGame = async () => {
    if (!session) return
    setIsActionLoading(true)
    try {
      await trpc.game.startGame.mutate({ sessionId: session.id })
      // Electric will sync automatically
    } finally {
      setIsActionLoading(false)
    }
  }

  const handleNextQuestion = async () => {
    if (!session) return
    setIsActionLoading(true)
    try {
      await trpc.game.nextQuestion.mutate({ sessionId: session.id })
      // Electric will sync automatically, roundStats is computed from responses
    } finally {
      setIsActionLoading(false)
    }
  }

  const handleForceReveal = async () => {
    if (!session) return
    setIsActionLoading(true)
    try {
      await trpc.game.forceReveal.mutate({ sessionId: session.id })
      // Electric will sync automatically
    } finally {
      setIsActionLoading(false)
    }
  }

  const handleEndGame = async () => {
    if (!session) return
    if (!confirm(`Are you sure you want to end the game?`)) return
    setIsActionLoading(true)
    try {
      await trpc.game.endGame.mutate({ sessionId: session.id })
      // Electric will sync automatically
    } finally {
      setIsActionLoading(false)
    }
  }

  const copyLink = async () => {
    await navigator.clipboard.writeText(gameUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (sessionsLoading || !session) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="spinner" />
      </div>
    )
  }

  // Lobby state
  if (session.status === `lobby`) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
        <a href="/admin/sessions" className="inline-flex items-center text-text-muted hover:text-buzzy-purple">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Sessions
        </a>

        {/* QR Code */}
        <div className="card-buzzy text-center">
          <h2 className="text-2xl font-bold text-text-dark mb-2">Scan to Join!</h2>
          <p className="text-text-muted mb-6">{bankName}</p>

          <div className="qr-container mb-6">
            <QRCodeSVG
              value={gameUrl}
              size={220}
              level="M"
              fgColor="#2D1B69"
              bgColor="#FFFFFF"
            />
          </div>

          <div className="flex items-center justify-center gap-2 mb-6">
            <code className="px-4 py-2 bg-gray-100 rounded-xl text-sm text-text-dark">
              {gameUrl}
            </code>
            <button
              onClick={copyLink}
              className="p-2 rounded-xl hover:bg-gray-100 text-text-muted"
            >
              {copied ? <Check className="w-5 h-5 text-state-correct" /> : <Copy className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Players */}
        <div className="card-buzzy">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-text-dark">
              <Users className="w-5 h-5 inline mr-2" />
              Players ({players.length})
            </h3>
          </div>

          {players.length === 0 ? (
            <p className="text-text-muted text-center py-8">
              Waiting for players to join...
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {players.map((player) => (
                <span
                  key={player.id}
                  className={`px-4 py-2 rounded-full font-medium ${
                    player.is_connected
                      ? `bg-buzzy-purple/10 text-buzzy-purple`
                      : `bg-gray-100 text-gray-400`
                  }`}
                >
                  {player.display_name}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Start button */}
        <button
          onClick={handleStartGame}
          disabled={isActionLoading || players.length === 0}
          className="btn-primary w-full text-2xl py-6"
        >
          <Play className="w-8 h-8 mr-3" />
          {isActionLoading ? `Starting...` : `Start Game`}
        </button>

        <p className="text-center text-text-muted text-sm">
          {questionsRemaining.total} questions available
        </p>
      </div>
    )
  }

  // Active/Revealing state
  if (session.status === `active` || session.status === `revealing`) {
    const isRevealing = session.status === `revealing`

    return (
      <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <span className={isRevealing ? `badge-revealing` : `badge-active`}>
              {isRevealing ? `Revealing Answer` : `Question Active`}
            </span>
            <p className="text-text-muted text-sm mt-1">
              Question {questionsRemaining.used} of {questionsRemaining.total}
            </p>
          </div>
          <button
            onClick={handleEndGame}
            disabled={isActionLoading}
            className="btn-danger btn-sm"
          >
            <Square className="w-4 h-4 mr-2" />
            End Game
          </button>
        </div>

        {/* Current Question */}
        {currentQuestion && (
          <div className="card-buzzy">
            <p className="text-sm text-text-muted mb-2">
              {currentQuestion.question_type === `multi` ? `Multi-select` : `Single answer`}
            </p>
            <h2 className="text-xl font-bold text-text-dark mb-4">
              {currentQuestion.question_text}
            </h2>

            <div className="space-y-2">
              {currentQuestion.options.map((option) => (
                <div
                  key={option.id}
                  className={`p-4 rounded-xl border-2 ${
                    isRevealing && option.is_correct
                      ? `bg-state-correct/10 border-state-correct text-state-correct`
                      : `bg-gray-50 border-gray-200 text-text-dark`
                  }`}
                >
                  {option.option_text}
                  {isRevealing && option.is_correct && (
                    <Check className="w-5 h-5 inline ml-2" />
                  )}
                </div>
              ))}
            </div>

            {isRevealing && roundStats && (
              <div className="mt-4 p-4 rounded-xl bg-buzzy-teal/10 text-center">
                <p className="text-3xl font-bold text-buzzy-teal">{roundStats.percentCorrect}%</p>
                <p className="text-sm text-text-muted">of players got it right</p>
              </div>
            )}
          </div>
        )}

        {/* Scoreboard */}
        <div className="card-buzzy">
          <h3 className="text-lg font-bold text-text-dark mb-4">Scoreboard</h3>
          <div className="space-y-2">
            {[...players]
              .sort((a, b) => b.score - a.score)
              .map((player, idx) => (
                <div
                  key={player.id}
                  className={`flex items-center justify-between p-3 rounded-xl ${
                    idx === 0 ? `bg-buzzy-yellow/20` : `bg-gray-50`
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {idx === 0 && <Crown className="w-5 h-5 text-buzzy-yellow" />}
                    <span className={`font-medium ${!player.is_connected ? `text-gray-400` : `text-text-dark`}`}>
                      {player.display_name}
                    </span>
                    {!player.is_connected && (
                      <span className="text-xs text-gray-400">(disconnected)</span>
                    )}
                  </div>
                  <span className="font-bold text-buzzy-purple">{player.score}</span>
                </div>
              ))}
          </div>
        </div>

        {/* Controls */}
        <div className="flex gap-4">
          {!isRevealing && (
            <button
              onClick={handleForceReveal}
              disabled={isActionLoading}
              className="btn-secondary flex-1"
            >
              <Eye className="w-5 h-5 mr-2" />
              {isActionLoading ? `...` : `Show Answer`}
            </button>
          )}

          {isRevealing && (
            <button
              onClick={handleNextQuestion}
              disabled={isActionLoading || questionsRemaining.remaining === 0}
              className="btn-primary flex-1"
            >
              <SkipForward className="w-5 h-5 mr-2" />
              {isActionLoading ? `...` : questionsRemaining.remaining === 0 ? `No More Questions` : `Next Question`}
            </button>
          )}
        </div>
      </div>
    )
  }

  // Ended state
  if (session.status === `ended`) {
    const winner = players.find((p) => p.id === session.winner_player_id)
    const sortedPlayers = [...players].sort((a, b) => b.score - a.score)

    return (
      <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
        <a href="/admin/sessions" className="inline-flex items-center text-text-muted hover:text-buzzy-purple">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Sessions
        </a>

        {/* Winner */}
        <div className="card-buzzy text-center bg-buzzy-gradient text-white">
          <Crown className="w-16 h-16 mx-auto mb-4 text-buzzy-yellow" />
          <h2 className="text-3xl font-bold mb-2">
            {winner?.display_name || `No Winner`} Wins!
          </h2>
          {winner && (
            <p className="text-2xl opacity-90">{winner.score} points</p>
          )}
        </div>

        {/* Final Standings */}
        <div className="card-buzzy">
          <h3 className="text-xl font-bold text-text-dark mb-4">Final Standings</h3>
          <div className="space-y-2">
            {sortedPlayers.map((player, idx) => (
              <div
                key={player.id}
                className={`flex items-center justify-between p-4 rounded-xl ${
                  idx === 0 ? `bg-buzzy-yellow/20` : idx === 1 ? `bg-gray-100` : idx === 2 ? `bg-buzzy-orange/10` : `bg-gray-50`
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-bold text-text-muted w-8">
                    {idx + 1}
                  </span>
                  {idx === 0 && <Crown className="w-6 h-6 text-buzzy-yellow" />}
                  {idx === 1 && <Trophy className="w-6 h-6 text-gray-400" />}
                  {idx === 2 && <Trophy className="w-6 h-6 text-buzzy-orange" />}
                  <span className="font-semibold text-text-dark">
                    {player.display_name}
                  </span>
                </div>
                <span className="font-bold text-buzzy-purple text-xl">{player.score}</span>
              </div>
            ))}
          </div>
        </div>

        <a href="/admin/sessions/new" className="btn-primary w-full inline-block text-center">
          Start New Game
        </a>
      </div>
    )
  }

  return null
}
