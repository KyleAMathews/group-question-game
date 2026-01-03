import {
  router,
  adminProcedure,
  publicProcedure,
  generateTxId,
} from "@/lib/trpc"
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { eq, and, notInArray, desc } from "drizzle-orm"
import {
  gameSessionsTable,
  questionsTable,
  answerOptionsTable,
  usedQuestionsTable,
  playersTable,
  playerResponsesTable,
  type SessionStatus,
} from "@/db/schema"

// Valid state transitions
const validTransitions: Record<SessionStatus, SessionStatus[]> = {
  lobby: [`active`],
  active: [`revealing`],
  revealing: [`active`, `ended`],
  ended: [],
}

function canTransition(from: SessionStatus, to: SessionStatus): boolean {
  return validTransitions[from]?.includes(to) ?? false
}

// Draw a random unused question from the bank
async function drawRandomQuestion(
  // eslint-disable-next-line quotes
  tx: Parameters<Parameters<typeof import("@/db/connection").db.transaction>[0]>[0],
  sessionId: number,
  bankId: number
) {
  // Get IDs of already used questions
  const usedQuestions = await tx
    .select({ question_id: usedQuestionsTable.question_id })
    .from(usedQuestionsTable)
    .where(eq(usedQuestionsTable.session_id, sessionId))

  const usedIds = usedQuestions.map((u: { question_id: number }) => u.question_id)

  // Get available questions
  let query = tx
    .select()
    .from(questionsTable)
    .where(eq(questionsTable.bank_id, bankId))

  if (usedIds.length > 0) {
    query = tx
      .select()
      .from(questionsTable)
      .where(
        and(
          eq(questionsTable.bank_id, bankId),
          notInArray(questionsTable.id, usedIds)
        )
      )
  }

  const availableQuestions = await query

  if (availableQuestions.length === 0) {
    return null
  }

  // Pick a random question
  const randomIndex = Math.floor(Math.random() * availableQuestions.length)
  return availableQuestions[randomIndex]
}

// Calculate winner based on highest score
async function calculateWinner(
  // eslint-disable-next-line quotes
  tx: Parameters<Parameters<typeof import("@/db/connection").db.transaction>[0]>[0],
  sessionId: number
) {
  const players = await tx
    .select()
    .from(playersTable)
    .where(eq(playersTable.session_id, sessionId))
    .orderBy(desc(playersTable.score))

  return players[0] || null
}

export const gameRouter = router({
  // Start the game (transition from lobby to active)
  startGame: adminProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const [session] = await ctx.db
        .select()
        .from(gameSessionsTable)
        .where(
          and(
            eq(gameSessionsTable.id, input.sessionId),
            eq(gameSessionsTable.admin_id, ctx.session.user.id)
          )
        )

      if (!session) {
        throw new TRPCError({
          code: `NOT_FOUND`,
          message: `Game session not found`,
        })
      }

      if (!canTransition(session.status as SessionStatus, `active`)) {
        throw new TRPCError({
          code: `BAD_REQUEST`,
          message: `Cannot start game from current state: ${session.status}`,
        })
      }

      // Check if there are players
      const players = await ctx.db
        .select()
        .from(playersTable)
        .where(eq(playersTable.session_id, input.sessionId))

      if (players.length === 0) {
        throw new TRPCError({
          code: `BAD_REQUEST`,
          message: `Cannot start game without players`,
        })
      }

      const result = await ctx.db.transaction(async (tx) => {
        const txid = await generateTxId(tx)

        // Draw first question
        const question = await drawRandomQuestion(
          tx,
          input.sessionId,
          session.bank_id
        )

        if (!question) {
          throw new TRPCError({
            code: `BAD_REQUEST`,
            message: `No questions available in the bank`,
          })
        }

        // Record as used
        const usedCount = await tx
          .select()
          .from(usedQuestionsTable)
          .where(eq(usedQuestionsTable.session_id, input.sessionId))

        await tx.insert(usedQuestionsTable).values({
          session_id: input.sessionId,
          question_id: question.id,
          question_order: usedCount.length + 1,
        })

        // Update session
        const [updated] = await tx
          .update(gameSessionsTable)
          .set({
            status: `active`,
            current_question_id: question.id,
            round_started_at: new Date(),
          })
          .where(eq(gameSessionsTable.id, input.sessionId))
          .returning()

        return { session: updated, txid }
      })

      return result
    }),

  // Advance to next question (from revealing to active)
  nextQuestion: adminProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const [session] = await ctx.db
        .select()
        .from(gameSessionsTable)
        .where(
          and(
            eq(gameSessionsTable.id, input.sessionId),
            eq(gameSessionsTable.admin_id, ctx.session.user.id)
          )
        )

      if (!session) {
        throw new TRPCError({
          code: `NOT_FOUND`,
          message: `Game session not found`,
        })
      }

      if (!canTransition(session.status as SessionStatus, `active`)) {
        throw new TRPCError({
          code: `BAD_REQUEST`,
          message: `Cannot go to next question from current state: ${session.status}`,
        })
      }

      const result = await ctx.db.transaction(async (tx) => {
        const txid = await generateTxId(tx)

        // Draw next question
        const question = await drawRandomQuestion(
          tx,
          input.sessionId,
          session.bank_id
        )

        if (!question) {
          throw new TRPCError({
            code: `BAD_REQUEST`,
            message: `No more questions available. Consider ending the game.`,
          })
        }

        // Record as used
        const usedCount = await tx
          .select()
          .from(usedQuestionsTable)
          .where(eq(usedQuestionsTable.session_id, input.sessionId))

        await tx.insert(usedQuestionsTable).values({
          session_id: input.sessionId,
          question_id: question.id,
          question_order: usedCount.length + 1,
        })

        // Update session
        const [updated] = await tx
          .update(gameSessionsTable)
          .set({
            status: `active`,
            current_question_id: question.id,
            round_started_at: new Date(),
          })
          .where(eq(gameSessionsTable.id, input.sessionId))
          .returning()

        return { session: updated, txid }
      })

      return result
    }),

  // Force show answer (transition to revealing)
  forceReveal: adminProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const [session] = await ctx.db
        .select()
        .from(gameSessionsTable)
        .where(
          and(
            eq(gameSessionsTable.id, input.sessionId),
            eq(gameSessionsTable.admin_id, ctx.session.user.id)
          )
        )

      if (!session) {
        throw new TRPCError({
          code: `NOT_FOUND`,
          message: `Game session not found`,
        })
      }

      if (!canTransition(session.status as SessionStatus, `revealing`)) {
        throw new TRPCError({
          code: `BAD_REQUEST`,
          message: `Cannot reveal answer from current state: ${session.status}`,
        })
      }

      const result = await ctx.db.transaction(async (tx) => {
        const txid = await generateTxId(tx)

        const [updated] = await tx
          .update(gameSessionsTable)
          .set({ status: `revealing` })
          .where(eq(gameSessionsTable.id, input.sessionId))
          .returning()

        return { session: updated, txid }
      })

      return result
    }),

  // End the game
  endGame: adminProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const [session] = await ctx.db
        .select()
        .from(gameSessionsTable)
        .where(
          and(
            eq(gameSessionsTable.id, input.sessionId),
            eq(gameSessionsTable.admin_id, ctx.session.user.id)
          )
        )

      if (!session) {
        throw new TRPCError({
          code: `NOT_FOUND`,
          message: `Game session not found`,
        })
      }

      // Can end from revealing or active state
      if (
        session.status !== `revealing` &&
        session.status !== `active` &&
        session.status !== `lobby`
      ) {
        throw new TRPCError({
          code: `BAD_REQUEST`,
          message: `Cannot end game from current state: ${session.status}`,
        })
      }

      const result = await ctx.db.transaction(async (tx) => {
        const txid = await generateTxId(tx)

        // Calculate winner
        const winner = await calculateWinner(tx, input.sessionId)

        const [updated] = await tx
          .update(gameSessionsTable)
          .set({
            status: `ended`,
            winner_player_id: winner?.id ?? null,
            ended_at: new Date(),
          })
          .where(eq(gameSessionsTable.id, input.sessionId))
          .returning()

        return { session: updated, winner, txid }
      })

      return result
    }),

  // Submit an answer (for players)
  submitAnswer: publicProcedure
    .input(
      z.object({
        playerId: z.string(),
        sessionId: z.number(),
        questionId: z.number(),
        selectedOptionIds: z.array(z.number()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify session is in active state
      const [session] = await ctx.db
        .select()
        .from(gameSessionsTable)
        .where(eq(gameSessionsTable.id, input.sessionId))

      if (!session) {
        throw new TRPCError({
          code: `NOT_FOUND`,
          message: `Game session not found`,
        })
      }

      if (session.status !== `active`) {
        throw new TRPCError({
          code: `BAD_REQUEST`,
          message: `Cannot submit answer when game is not active`,
        })
      }

      if (session.current_question_id !== input.questionId) {
        throw new TRPCError({
          code: `BAD_REQUEST`,
          message: `This is not the current question`,
        })
      }

      // Verify player exists and belongs to session
      const [player] = await ctx.db
        .select()
        .from(playersTable)
        .where(
          and(
            eq(playersTable.id, input.playerId),
            eq(playersTable.session_id, input.sessionId)
          )
        )

      if (!player) {
        throw new TRPCError({
          code: `NOT_FOUND`,
          message: `Player not found in this session`,
        })
      }

      // Check if already answered this question
      const existingResponse = await ctx.db
        .select()
        .from(playerResponsesTable)
        .where(
          and(
            eq(playerResponsesTable.player_id, input.playerId),
            eq(playerResponsesTable.question_id, input.questionId)
          )
        )

      if (existingResponse.length > 0) {
        throw new TRPCError({
          code: `BAD_REQUEST`,
          message: `You have already answered this question`,
        })
      }

      // Get the question and its options
      const [question] = await ctx.db
        .select()
        .from(questionsTable)
        .where(eq(questionsTable.id, input.questionId))

      if (!question) {
        throw new TRPCError({
          code: `NOT_FOUND`,
          message: `Question not found`,
        })
      }

      const options = await ctx.db
        .select()
        .from(answerOptionsTable)
        .where(eq(answerOptionsTable.question_id, input.questionId))

      // Calculate points
      const correctOptionIds = options
        .filter((o) => o.is_correct)
        .map((o) => o.id)
      const incorrectOptionIds = options
        .filter((o) => !o.is_correct)
        .map((o) => o.id)

      let points = 0
      if (question.question_type === `single`) {
        // Single answer: 1 point if correct, 0 if wrong
        if (
          input.selectedOptionIds.length === 1 &&
          correctOptionIds.includes(input.selectedOptionIds[0])
        ) {
          points = 1
        }
      } else {
        // Multi-select: +1 for each correct selected, -1 for each incorrect selected
        for (const selectedId of input.selectedOptionIds) {
          if (correctOptionIds.includes(selectedId)) {
            points += 1
          } else if (incorrectOptionIds.includes(selectedId)) {
            points -= 1
          }
        }
      }

      const result = await ctx.db.transaction(async (tx) => {
        const txid = await generateTxId(tx)

        // Record the response
        const [response] = await tx
          .insert(playerResponsesTable)
          .values({
            player_id: input.playerId,
            session_id: input.sessionId,
            question_id: input.questionId,
            selected_option_ids: input.selectedOptionIds,
            points_earned: points,
          })
          .returning()

        // Update player score
        const [updatedPlayer] = await tx
          .update(playersTable)
          .set({ score: player.score + points })
          .where(eq(playersTable.id, input.playerId))
          .returning()

        // Check if all connected players have answered
        const connectedPlayers = await tx
          .select()
          .from(playersTable)
          .where(
            and(
              eq(playersTable.session_id, input.sessionId),
              eq(playersTable.is_connected, true)
            )
          )

        const responses = await tx
          .select()
          .from(playerResponsesTable)
          .where(
            and(
              eq(playerResponsesTable.session_id, input.sessionId),
              eq(playerResponsesTable.question_id, input.questionId)
            )
          )

        const allAnswered = responses.length >= connectedPlayers.length

        // Auto-reveal if all players have answered
        if (allAnswered) {
          await tx
            .update(gameSessionsTable)
            .set({ status: `revealing` })
            .where(eq(gameSessionsTable.id, input.sessionId))
        }

        return {
          response,
          points,
          newScore: updatedPlayer.score,
          allAnswered,
          txid,
        }
      })

      return result
    }),

  // Get current question with options (for players during active state)
  getCurrentQuestion: publicProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(async ({ ctx, input }) => {
      const [session] = await ctx.db
        .select()
        .from(gameSessionsTable)
        .where(eq(gameSessionsTable.id, input.sessionId))

      if (!session || !session.current_question_id) {
        return null
      }

      const [question] = await ctx.db
        .select()
        .from(questionsTable)
        .where(eq(questionsTable.id, session.current_question_id))

      if (!question) {
        return null
      }

      const options = await ctx.db
        .select()
        .from(answerOptionsTable)
        .where(eq(answerOptionsTable.question_id, question.id))
        .orderBy(answerOptionsTable.display_order)

      // During active state, don't reveal which answers are correct
      const sanitizedOptions =
        session.status === `active`
          ? options.map((o) => ({ ...o, is_correct: false }))
          : options

      return {
        ...question,
        options: sanitizedOptions,
        roundStartedAt: session.round_started_at,
        roundDurationSeconds: session.round_duration_seconds,
      }
    }),

  // Get round statistics (for reveal screen)
  getRoundStats: publicProcedure
    .input(
      z.object({
        sessionId: z.number(),
        questionId: z.number(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Get all responses for this question
      const responses = await ctx.db
        .select()
        .from(playerResponsesTable)
        .where(
          and(
            eq(playerResponsesTable.session_id, input.sessionId),
            eq(playerResponsesTable.question_id, input.questionId)
          )
        )

      // Get the correct answers
      const options = await ctx.db
        .select()
        .from(answerOptionsTable)
        .where(eq(answerOptionsTable.question_id, input.questionId))

      const correctOptionIds = options
        .filter((o) => o.is_correct)
        .map((o) => o.id)

      // Calculate how many got it right
      let correctCount = 0
      for (const response of responses) {
        const selectedIds = response.selected_option_ids
        const isCorrect =
          selectedIds.length === correctOptionIds.length &&
          selectedIds.every((id) => correctOptionIds.includes(id))
        if (isCorrect) correctCount++
      }

      const totalResponses = responses.length
      const percentCorrect =
        totalResponses > 0
          ? Math.round((correctCount / totalResponses) * 100)
          : 0

      return {
        totalResponses,
        correctCount,
        percentCorrect,
      }
    }),

  // Get a player's response for current question
  getPlayerResponse: publicProcedure
    .input(
      z.object({
        playerId: z.string(),
        questionId: z.number(),
      })
    )
    .query(async ({ ctx, input }) => {
      const [response] = await ctx.db
        .select()
        .from(playerResponsesTable)
        .where(
          and(
            eq(playerResponsesTable.player_id, input.playerId),
            eq(playerResponsesTable.question_id, input.questionId)
          )
        )

      return response || null
    }),

  // Get remaining questions count
  getRemainingQuestionsCount: publicProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(async ({ ctx, input }) => {
      const [session] = await ctx.db
        .select()
        .from(gameSessionsTable)
        .where(eq(gameSessionsTable.id, input.sessionId))

      if (!session) {
        return { total: 0, used: 0, remaining: 0 }
      }

      const totalQuestions = await ctx.db
        .select()
        .from(questionsTable)
        .where(eq(questionsTable.bank_id, session.bank_id))

      const usedQuestions = await ctx.db
        .select()
        .from(usedQuestionsTable)
        .where(eq(usedQuestionsTable.session_id, input.sessionId))

      return {
        total: totalQuestions.length,
        used: usedQuestions.length,
        remaining: totalQuestions.length - usedQuestions.length,
      }
    }),
})
