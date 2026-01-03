import { createFileRoute } from "@tanstack/react-router"
import { useLiveQuery, eq } from "@tanstack/react-db"
import {
  sessionsCollection,
  playersCollection,
  responsesCollection,
  questionsCollection,
  answerOptionsCollection,
  usedQuestionsCollection,
  playerSessionsCollection,
} from "@/lib/collections"

// Temp ID counter for optimistic response inserts
let tempResponseId = -1
import { trpc } from "@/lib/trpc-client"
import { useEffect, useState, useMemo } from "react"
import { Zap, Users, Check, X, Crown, Trophy, Gamepad2 } from "lucide-react"

// Types for Electric data (dates are parsed as Date objects)
interface SessionData {
  id: number
  slug: string
  bank_id: number
  admin_id: string
  status: string
  current_question_id: number | null
  round_started_at: Date | null
  round_duration_seconds: number
  winner_player_id: string | null
  created_at: Date
  ended_at: Date | null
  bankName?: string | null
}

interface PlayerData {
  id: string
  session_id: number
  display_name: string
  score: number
  is_connected: boolean
  joined_at: Date
  last_seen_at: Date
}

interface AnswerOptionData {
  id: number
  question_id: number
  option_text: string
  is_correct: boolean
  display_order: number
}

interface QuestionData {
  id: number
  question_text: string
  question_type: string
  image_data?: string | null
  image_mime_type?: string | null
  explanation?: string | null
  options: AnswerOptionData[]
  roundStartedAt: Date | null
  roundDurationSeconds: number
}

// Seeded random shuffle - same seed produces same order
function seededShuffle<T>(array: T[], seed: string): T[] {
  const result = [...array]
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0
  }

  // Fisher-Yates shuffle with seeded random
  for (let i = result.length - 1; i > 0; i--) {
    hash = ((hash << 5) - hash + i) | 0
    const j = Math.abs(hash) % (i + 1)
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

export const Route = createFileRoute(`/game/$slug`)({
  component: PlayerGame,
  ssr: false,
  loader: async () => {
    // Preload all collections needed for the game
    // This ensures data is ready before rendering, preventing flash of "not found"
    await Promise.all([
      sessionsCollection.preload(),
      playersCollection.preload(),
      responsesCollection.preload(),
      questionsCollection.preload(),
      answerOptionsCollection.preload(),
      usedQuestionsCollection.preload(),
      playerSessionsCollection.preload(),
    ])
  },
})

function PlayerGame() {
  const { slug } = Route.useParams()

  // Real-time session sync via Electric SQL
  const { data: sessionsData, isLoading: sessionsLoading } = useLiveQuery((q) =>
    q.from({ sessions: sessionsCollection })
      .where(({ sessions }) => eq(sessions.slug, slug))
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

  // Real-time responses sync for current session
  const { data: responsesData } = useLiveQuery((q) =>
    q.from({ responses: responsesCollection })
      .where(({ responses }) => eq(responses.session_id, sessionId))
  )
  const responses = responsesData || []

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

  // Load used questions for history (which questions were asked in this session)
  const { data: usedQuestionsData } = useLiveQuery((q) =>
    q.from({ used: usedQuestionsCollection })
      .where(({ used }) => eq(used.session_id, sessionId))
  )
  const usedQuestions = usedQuestionsData || []

  // Get stored player ID from localStorage collection
  const { data: storedPlayerSessions } = useLiveQuery((q) =>
    q.from({ ps: playerSessionsCollection })
      .where(({ ps }) => eq(ps.sessionId, sessionId))
  )
  const storedPlayerId = storedPlayerSessions?.[0]?.playerId

  // Find the current player from the players list using stored ID
  const currentPlayer = useMemo(() => {
    if (!storedPlayerId) return null
    return players.find((p) => p.id === storedPlayerId) || null
  }, [storedPlayerId, players])

  // Compute current question with options and round timing
  // Options are shuffled per-player using a seeded random for fairness
  const currentQuestion: QuestionData | null = useMemo(() => {
    if (!session?.current_question_id) return null
    const question = allQuestions.find((q) => q.id === session.current_question_id)
    if (!question) return null

    // Sort by display_order first, then shuffle with player-specific seed
    const sortedOptions = allOptions
      .filter((o) => o.question_id === question.id)
      .sort((a, b) => a.display_order - b.display_order)

    // Seed based on session + question + player ensures:
    // - Different players see different orders
    // - Same player sees same order on refresh
    const shuffleSeed = `${session.id}-${question.id}-${storedPlayerId || `anon`}`
    const options = seededShuffle(sortedOptions, shuffleSeed)

    return {
      ...question,
      options,
      roundStartedAt: session.round_started_at,
      roundDurationSeconds: session.round_duration_seconds,
    }
  }, [session?.current_question_id, session?.id, session?.round_started_at, session?.round_duration_seconds, allQuestions, allOptions, storedPlayerId])

  // Compute round stats from responses
  const roundStats = useMemo(() => {
    if (session?.status !== `revealing` || !session.current_question_id) return null
    const questionResponses = responses.filter((r) => r.question_id === session.current_question_id)
    if (questionResponses.length === 0) return { percentCorrect: 0 }
    const correctCount = questionResponses.filter((r) => r.points_earned > 0).length
    return { percentCorrect: Math.round((correctCount / questionResponses.length) * 100) }
  }, [session?.status, session?.current_question_id, responses])

  // Get winner from players list
  const winner = useMemo(() => {
    if (session?.status !== `ended` || !session.winner_player_id) return null
    return players.find((p) => p.id === session.winner_player_id) || null
  }, [session?.status, session?.winner_player_id, players])

  // Build game history for ended state
  const gameHistory = useMemo(() => {
    if (session?.status !== `ended`) return []

    // Sort used questions by order they were asked
    const sortedUsed = [...usedQuestions].sort((a, b) => a.question_order - b.question_order)

    return sortedUsed.map((used) => {
      const question = allQuestions.find((q) => q.id === used.question_id)
      if (!question) return null

      const options = allOptions
        .filter((o) => o.question_id === question.id)
        .sort((a, b) => a.display_order - b.display_order)

      // Find this player's response
      const playerResp = responses.find(
        (r) => r.question_id === question.id
      )

      return {
        questionId: question.id,
        questionText: question.question_text,
        questionType: question.question_type,
        explanation: question.explanation,
        options,
        playerSelectedIds: (playerResp?.selected_option_ids || []) as number[],
        pointsEarned: playerResp?.points_earned || 0,
      }
    }).filter(Boolean) as Array<{
      questionId: number
      questionText: string
      questionType: string
      explanation: string | null
      options: AnswerOptionData[]
      playerSelectedIds: number[]
      pointsEarned: number
    }>
  }, [session?.status, usedQuestions, allQuestions, allOptions, responses])

  const [selectedOptions, setSelectedOptions] = useState<number[]>([])
  const [hasSubmitted, setHasSubmitted] = useState(false)
  const [playerResponse, setPlayerResponse] = useState<{ points_earned: number } | null>(null)
  const [timeRemaining, setTimeRemaining] = useState(30)
  const [error, setError] = useState(``)
  const [displayName, setDisplayName] = useState(``)
  const [isJoining, setIsJoining] = useState(false)
  const [prevQuestionId, setPrevQuestionId] = useState<number | null>(null)
  const [hasCalledRejoin, setHasCalledRejoin] = useState(false)

  // Notify server when a returning player is detected (for connected status)
  useEffect(() => {
    if (!session || !currentPlayer || hasCalledRejoin) return

    trpc.players.rejoin.mutate({
      playerId: currentPlayer.id,
      sessionId: session.id,
    }).catch(() => {
      // Ignore rejoin errors
    })
    setHasCalledRejoin(true)
  }, [session?.id, currentPlayer?.id, hasCalledRejoin])

  // Reset state when question changes
  useEffect(() => {
    if (!session?.current_question_id) return

    if (session.current_question_id !== prevQuestionId) {
      // Reset state for new question
      if (prevQuestionId !== null && session.status === `active`) {
        setSelectedOptions([])
        setHasSubmitted(false)
        setPlayerResponse(null)
      }
      setPrevQuestionId(session.current_question_id)
    }
  }, [session?.status, session?.current_question_id, prevQuestionId])

  // Watch live responses for current player's answer (syncs points from server)
  useEffect(() => {
    if (!session || !currentPlayer || !session.current_question_id) return

    // Find player's response for current question from live data
    const myResponse = responses.find(
      (r) => r.player_id === currentPlayer.id && r.question_id === session.current_question_id
    )

    if (myResponse) {
      setHasSubmitted(true)
      // Update with real points from server (synced via Electric)
      if (myResponse.id > 0) {
        // Real response (not optimistic) - has actual points
        setPlayerResponse({ points_earned: myResponse.points_earned })
        setSelectedOptions(myResponse.selected_option_ids as number[])
      }
    }
  }, [responses, session?.current_question_id, currentPlayer?.id])

  // Timer countdown
  useEffect(() => {
    if (!session || session.status !== `active` || !currentQuestion?.roundStartedAt) return

    const endTime = currentQuestion.roundStartedAt.getTime() + currentQuestion.roundDurationSeconds * 1000

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000))
      setTimeRemaining(remaining)
    }, 100)

    return () => clearInterval(interval)
  }, [session, currentQuestion])

  // Join game
  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!session || displayName.length < 3) return

    setIsJoining(true)
    setError(``)

    try {
      const result = await trpc.players.join.mutate({
        sessionId: session.id,
        displayName,
        playerId: storedPlayerId || undefined,
      })

      // Save player ID to localStorage collection for rejoin support
      playerSessionsCollection.insert({
        sessionId: session.id,
        playerId: result.player.id,
      })
      // Player will sync via Electric and currentPlayer will update automatically
    } catch (err: unknown) {
      const error = err as { message?: string }
      setError(error.message || `Failed to join game`)
    } finally {
      setIsJoining(false)
    }
  }

  // Submit answer - optimistic insert, server calculates points
  const handleSubmitAnswer = async () => {
    if (!session || !currentQuestion || !currentPlayer || selectedOptions.length === 0) return

    setHasSubmitted(true)

    try {
      // Optimistic insert - points_earned starts at 0, server calculates actual points
      // The onInsert handler calls tRPC and Electric syncs back the real response
      responsesCollection.insert({
        id: tempResponseId--,
        player_id: currentPlayer.id,
        session_id: session.id,
        question_id: currentQuestion.id,
        selected_option_ids: selectedOptions,
        points_earned: 0, // Server will calculate actual points
        submitted_at: new Date(),
      })

      // Points will sync back via Electric - for now show "submitted" state
      setPlayerResponse({ points_earned: 0 })
    } catch (err: unknown) {
      const error = err as { message?: string }
      setError(error.message || `Failed to submit answer`)
      setHasSubmitted(false)
    }
  }

  // Toggle option selection
  const toggleOption = (optionId: number) => {
    if (hasSubmitted || session?.status !== `active`) return

    if (currentQuestion?.question_type === `single`) {
      setSelectedOptions([optionId])
    } else {
      setSelectedOptions((prev) =>
        prev.includes(optionId) ? prev.filter((id) => id !== optionId) : [...prev, optionId]
      )
    }
  }

  if (sessionsLoading) {
    return (
      <div className="min-h-screen bg-buzzy-gradient flex items-center justify-center">
        <div className="spinner" />
      </div>
    )
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-buzzy-gradient flex items-center justify-center p-4">
        <div className="card-buzzy text-center max-w-md">
          <X className="w-16 h-16 text-state-wrong mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-text-dark mb-2">Game Not Found</h1>
          <p className="text-text-muted">This game session doesn't exist or has been removed.</p>
        </div>
      </div>
    )
  }

  // Join screen (only for lobby status)
  if (!currentPlayer && session?.status === `lobby`) {
    return (
      <div className="min-h-screen bg-buzzy-gradient flex items-center justify-center p-4">
        <div className="card-buzzy max-w-md w-full animate-bounce-in">
          <div className="text-center mb-8">
            <div className="w-20 h-20 rounded-full bg-buzzy-gradient mx-auto mb-4 flex items-center justify-center">
              <Zap className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-text-dark">Join the Game!</h1>
            <p className="text-text-muted mt-2">{session.bankName}</p>
          </div>

          <form onSubmit={handleJoin} className="space-y-4">
            <div>
              <input
                type="text"
                placeholder="Enter your name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="input-buzzy text-center"
                minLength={3}
                maxLength={50}
                required
                autoFocus
              />
              <p className="text-xs text-text-muted mt-2 text-center">
                Minimum 3 characters
              </p>
            </div>

            {error && (
              <div className="p-4 rounded-xl bg-red-50 border-2 border-red-200">
                <p className="text-red-700 text-sm font-medium text-center">{error}</p>
              </div>
            )}

            <button type="submit" disabled={isJoining || displayName.length < 3} className="btn-primary w-full">
              {isJoining ? `Joining...` : `Join Game`}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-gray-100">
            <p className="text-sm text-text-muted text-center mb-3">
              {players.length} player{players.length !== 1 ? `s` : ``} waiting
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {players.slice(0, 10).map((p) => (
                <span key={p.id} className="px-3 py-1 bg-buzzy-purple/10 rounded-full text-sm font-medium text-buzzy-purple">
                  {p.display_name}
                </span>
              ))}
              {players.length > 10 && (
                <span className="px-3 py-1 bg-gray-100 rounded-full text-sm text-text-muted">
                  +{players.length - 10} more
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Can't join mid-game
  if (!currentPlayer && session?.status !== `lobby`) {
    return (
      <div className="min-h-screen bg-buzzy-gradient flex items-center justify-center p-4">
        <div className="card-buzzy text-center max-w-md">
          <Gamepad2 className="w-16 h-16 text-buzzy-orange mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-text-dark mb-2">Game in Progress</h1>
          <p className="text-text-muted">
            This game has already started. You can join the next session!
          </p>
        </div>
      </div>
    )
  }

  // Lobby - waiting for game to start
  if (session?.status === `lobby` && currentPlayer) {
    return (
      <div className="min-h-screen bg-buzzy-gradient flex items-center justify-center p-4">
        <div className="card-buzzy max-w-md w-full text-center animate-fade-in">
          <div className="w-20 h-20 rounded-full bg-buzzy-gradient mx-auto mb-4 flex items-center justify-center">
            <Users className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-text-dark mb-2">You're In!</h1>
          <p className="text-xl text-buzzy-purple font-semibold mb-6">{currentPlayer.display_name}</p>

          <div className="p-4 rounded-xl bg-buzzy-gradient-soft mb-6">
            <p className="text-text-muted">Waiting for the host to start the game...</p>
          </div>

          <div className="space-y-2">
            <p className="text-sm text-text-muted">Players ready:</p>
            <div className="flex flex-wrap justify-center gap-2">
              {players.map((p) => (
                <span
                  key={p.id}
                  className={`px-3 py-1 rounded-full text-sm font-medium ${
                    p.id === currentPlayer.id
                      ? `bg-buzzy-purple text-white`
                      : `bg-buzzy-purple/10 text-buzzy-purple`
                  }`}
                >
                  {p.display_name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Active game - question screen
  if ((session?.status === `active` || session?.status === `revealing`) && currentQuestion) {
    const isRevealing = session.status === `revealing`

    return (
      <div className="min-h-screen bg-buzzy-gradient-soft flex flex-col">
        {/* Header */}
        <div className="bg-white shadow-md px-4 py-3">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="avatar-buzzy text-sm">{currentPlayer?.display_name[0]}</div>
              <div>
                <p className="font-semibold text-text-dark">{currentPlayer?.display_name}</p>
                <p className="text-sm text-text-muted">Score: {currentPlayer?.score || 0}</p>
              </div>
            </div>

            {!isRevealing && (
              <div className={`relative ${timeRemaining <= 5 ? `timer-urgent` : ``}`}>
                <svg className="w-16 h-16 transform -rotate-90">
                  <circle cx="32" cy="32" r="28" className="fill-none stroke-gray-200" strokeWidth="6" />
                  <circle
                    cx="32"
                    cy="32"
                    r="28"
                    className={`fill-none timer-circle ${timeRemaining <= 5 ? `stroke-state-wrong` : `stroke-buzzy-teal`}`}
                    strokeWidth="6"
                    strokeDasharray={`${(timeRemaining / currentQuestion.roundDurationSeconds) * 176} 176`}
                  />
                </svg>
                <span
                  className={`absolute inset-0 flex items-center justify-center text-xl font-bold ${
                    timeRemaining <= 5 ? `text-state-wrong` : `text-text-dark`
                  }`}
                >
                  {timeRemaining}
                </span>
              </div>
            )}

            {isRevealing && roundStats && (
              <div className="text-right">
                <p className="text-2xl font-bold text-buzzy-teal">{roundStats.percentCorrect}%</p>
                <p className="text-xs text-text-muted">got it right</p>
              </div>
            )}
          </div>
        </div>

        {/* Question */}
        <div className="flex-1 p-4 max-w-2xl mx-auto w-full">
          <div className="card-buzzy mb-6 animate-slide-down">
            {currentQuestion.image_data && (
              <div className="mb-4 rounded-xl overflow-hidden">
                <img
                  src={`data:${currentQuestion.image_mime_type};base64,${currentQuestion.image_data}`}
                  alt="Question"
                  className="w-full h-48 object-contain bg-gray-100"
                />
              </div>
            )}

            <h2 className="text-xl font-bold text-text-dark">{currentQuestion.question_text}</h2>

            {currentQuestion.question_type === `multi` && (
              <p className="text-sm text-buzzy-purple mt-2 font-medium">Select all that apply</p>
            )}
          </div>

          {/* Answer options */}
          <div className="space-y-3">
            {currentQuestion.options.map((option, idx) => {
              const isSelected = selectedOptions.includes(option.id)
              let optionClass = `answer-option-default`

              if (isRevealing) {
                if (option.is_correct) {
                  optionClass = `answer-option-correct`
                } else if (isSelected && !option.is_correct) {
                  optionClass = `answer-option-wrong`
                }
              } else if (isSelected) {
                optionClass = `answer-option-selected`
              }

              return (
                <button
                  key={option.id}
                  onClick={() => toggleOption(option.id)}
                  disabled={hasSubmitted || isRevealing}
                  className={`${optionClass} animate-slide-up stagger-${idx + 1}`}
                  style={{ animationFillMode: `both` }}
                >
                  <div className="flex items-center gap-3">
                    {currentQuestion.question_type === `multi` && (
                      <div
                        className={`w-6 h-6 rounded border-2 flex items-center justify-center ${
                          isSelected ? `bg-white border-white` : `border-current`
                        }`}
                      >
                        {isSelected && <Check className="w-4 h-4 text-buzzy-purple" />}
                      </div>
                    )}
                    <span>{option.option_text}</span>
                    {isRevealing && option.is_correct && <Check className="w-5 h-5 ml-auto" />}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Submit button */}
          {!hasSubmitted && !isRevealing && (
            <button
              onClick={handleSubmitAnswer}
              disabled={selectedOptions.length === 0}
              className="btn-primary w-full mt-6"
            >
              Submit Answer
            </button>
          )}

          {/* Submitted state */}
          {hasSubmitted && !isRevealing && (
            <div className="mt-6 p-4 rounded-xl bg-buzzy-teal/10 border-2 border-buzzy-teal/20 text-center">
              <Check className="w-8 h-8 text-buzzy-teal mx-auto mb-2" />
              <p className="font-semibold text-buzzy-teal">Answer submitted!</p>
              <p className="text-sm text-text-muted">Waiting for others...</p>
            </div>
          )}

          {/* Reveal results */}
          {isRevealing && playerResponse && (
            <div
              className={`mt-6 p-4 rounded-xl text-center ${
                playerResponse.points_earned > 0
                  ? `bg-state-correct/10 border-2 border-state-correct/20`
                  : `bg-state-wrong/10 border-2 border-state-wrong/20`
              }`}
            >
              <p className="text-3xl font-bold mb-1">
                {playerResponse.points_earned > 0 ? `+${playerResponse.points_earned}` : playerResponse.points_earned}
              </p>
              <p className={`font-semibold ${playerResponse.points_earned > 0 ? `text-state-correct` : `text-state-wrong`}`}>
                {playerResponse.points_earned > 0 ? `Nice!` : `Better luck next time!`}
              </p>
            </div>
          )}

          {/* Explanation */}
          {isRevealing && currentQuestion.explanation && (
            <div className="mt-4 p-4 rounded-xl bg-buzzy-purple/10 border-2 border-buzzy-purple/20">
              <p className="font-semibold text-buzzy-purple mb-1">Did you know?</p>
              <p className="text-text-dark">{currentQuestion.explanation}</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Game ended - results with question history
  if (session?.status === `ended`) {
    const isWinner = winner?.id === currentPlayer?.id

    return (
      <div className="min-h-screen bg-buzzy-gradient-soft">
        {/* Header with results */}
        <div className="bg-white shadow-md px-4 py-6">
          <div className="max-w-2xl mx-auto text-center">
            {isWinner ? (
              <>
                <Crown className="w-16 h-16 crown-winner animate-wiggle mx-auto mb-2" />
                <h1 className="text-3xl font-bold text-text-dark">You Won!</h1>
              </>
            ) : (
              <>
                <Trophy className="w-16 h-16 text-buzzy-orange mx-auto mb-2" />
                <h1 className="text-2xl font-bold text-text-dark">Game Over!</h1>
              </>
            )}

            {winner && !isWinner && (
              <p className="text-text-muted mt-2">
                Winner: <span className="font-semibold text-buzzy-purple">{winner.display_name}</span> ({winner.score} pts)
              </p>
            )}

            <div className="mt-4 inline-block px-6 py-3 rounded-xl bg-buzzy-gradient-soft">
              <p className="text-sm text-text-muted">Your Score</p>
              <p className="text-3xl font-bold text-text-dark">{currentPlayer?.score || 0}</p>
            </div>
          </div>
        </div>

        {/* Question History */}
        <div className="max-w-2xl mx-auto p-4">
          <h2 className="text-xl font-bold text-text-dark mb-4">Your Answers</h2>

          <div className="space-y-4">
            {gameHistory.map((item, idx) => {
              const gotItRight = item.pointsEarned > 0

              return (
                <div key={item.questionId} className="card-buzzy">
                  <div className="flex items-start gap-3 mb-3">
                    <span className="flex-shrink-0 w-8 h-8 rounded-full bg-buzzy-purple/10 flex items-center justify-center text-sm font-bold text-buzzy-purple">
                      {idx + 1}
                    </span>
                    <div className="flex-1">
                      <p className="font-semibold text-text-dark">{item.questionText}</p>
                    </div>
                    <span
                      className={`flex-shrink-0 px-2 py-1 rounded-full text-xs font-medium ${
                        gotItRight
                          ? `bg-state-correct/10 text-state-correct`
                          : `bg-state-wrong/10 text-state-wrong`
                      }`}
                    >
                      {gotItRight ? `+${item.pointsEarned}` : item.pointsEarned}
                    </span>
                  </div>

                  <div className="space-y-2 ml-11">
                    {item.options.map((option) => {
                      const wasSelected = item.playerSelectedIds.includes(option.id)
                      const isCorrect = option.is_correct

                      let bgClass = `bg-gray-50`
                      let textClass = `text-text-muted`
                      let icon = null

                      if (isCorrect) {
                        bgClass = `bg-state-correct/10`
                        textClass = `text-state-correct`
                        icon = <Check className="w-4 h-4" />
                      } else if (wasSelected && !isCorrect) {
                        bgClass = `bg-state-wrong/10`
                        textClass = `text-state-wrong`
                        icon = <X className="w-4 h-4" />
                      }

                      return (
                        <div
                          key={option.id}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg ${bgClass}`}
                        >
                          {wasSelected && (
                            <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                              isCorrect ? `border-state-correct bg-state-correct` : `border-state-wrong bg-state-wrong`
                            }`}>
                              <span className="w-2 h-2 rounded-full bg-white" />
                            </span>
                          )}
                          {!wasSelected && isCorrect && (
                            <span className="w-4 h-4 rounded-full border-2 border-state-correct" />
                          )}
                          {!wasSelected && !isCorrect && (
                            <span className="w-4 h-4" />
                          )}
                          <span className={`flex-1 text-sm ${textClass}`}>{option.option_text}</span>
                          {icon}
                        </div>
                      )
                    })}
                  </div>

                  {item.explanation && (
                    <div className="mt-3 ml-11 p-3 rounded-lg bg-buzzy-purple/5 border border-buzzy-purple/10">
                      <p className="text-xs text-buzzy-purple font-medium mb-1">Did you know?</p>
                      <p className="text-sm text-text-dark">{item.explanation}</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {gameHistory.length === 0 && (
            <div className="card-buzzy text-center">
              <p className="text-text-muted">No questions were answered in this game.</p>
            </div>
          )}

          <p className="text-center text-text-muted mt-6 mb-4">Thanks for playing!</p>
        </div>
      </div>
    )
  }

  return null
}
