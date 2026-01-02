import {
  router,
  adminProcedure,
  publicProcedure,
  generateTxId,
} from "@/lib/trpc"
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { eq, desc, and } from "drizzle-orm"
import {
  gameSessionsTable,
  questionBanksTable,
  playersTable,
  questionsTable,
} from "@/db/schema"

export const sessionsRouter = router({
  // List all sessions for the current admin
  listAdmin: adminProcedure.query(async ({ ctx }) => {
    const sessions = await ctx.db
      .select({
        session: gameSessionsTable,
        bankName: questionBanksTable.name,
      })
      .from(gameSessionsTable)
      .leftJoin(
        questionBanksTable,
        eq(gameSessionsTable.bank_id, questionBanksTable.id)
      )
      .where(eq(gameSessionsTable.admin_id, ctx.session.user.id))
      .orderBy(desc(gameSessionsTable.created_at))

    // Get player counts for each session
    const sessionsWithCounts = await Promise.all(
      sessions.map(async ({ session, bankName }) => {
        const players = await ctx.db
          .select()
          .from(playersTable)
          .where(eq(playersTable.session_id, session.id))

        return {
          ...session,
          bankName,
          playerCount: players.length,
        }
      })
    )

    return sessionsWithCounts
  }),

  // Get a session by slug (public - for players to join)
  getBySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const [result] = await ctx.db
        .select({
          session: gameSessionsTable,
          bankName: questionBanksTable.name,
        })
        .from(gameSessionsTable)
        .leftJoin(
          questionBanksTable,
          eq(gameSessionsTable.bank_id, questionBanksTable.id)
        )
        .where(eq(gameSessionsTable.slug, input.slug))

      if (!result) {
        throw new TRPCError({
          code: `NOT_FOUND`,
          message: `Game session not found`,
        })
      }

      return {
        ...result.session,
        bankName: result.bankName,
      }
    }),

  // Get a session by ID (admin only)
  get: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const [result] = await ctx.db
        .select({
          session: gameSessionsTable,
          bank: questionBanksTable,
        })
        .from(gameSessionsTable)
        .leftJoin(
          questionBanksTable,
          eq(gameSessionsTable.bank_id, questionBanksTable.id)
        )
        .where(
          and(
            eq(gameSessionsTable.id, input.id),
            eq(gameSessionsTable.admin_id, ctx.session.user.id)
          )
        )

      if (!result) {
        throw new TRPCError({
          code: `NOT_FOUND`,
          message: `Game session not found`,
        })
      }

      // Get players
      const players = await ctx.db
        .select()
        .from(playersTable)
        .where(eq(playersTable.session_id, input.id))
        .orderBy(desc(playersTable.score))

      // Get question count from the bank
      const questions = await ctx.db
        .select()
        .from(questionsTable)
        .where(eq(questionsTable.bank_id, result.session.bank_id))

      return {
        ...result.session,
        bank: result.bank,
        players,
        totalQuestions: questions.length,
      }
    }),

  // Create a new session
  create: adminProcedure
    .input(
      z.object({
        slug: z
          .string()
          .min(1)
          .max(100)
          .regex(
            /^[a-z0-9-]+$/,
            `Slug must only contain lowercase letters, numbers, and hyphens`
          ),
        bankId: z.number(),
        roundDurationSeconds: z.number().min(10).max(120).default(30),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify bank exists and has questions
      const [bank] = await ctx.db
        .select()
        .from(questionBanksTable)
        .where(eq(questionBanksTable.id, input.bankId))

      if (!bank) {
        throw new TRPCError({
          code: `NOT_FOUND`,
          message: `Question bank not found`,
        })
      }

      const questions = await ctx.db
        .select()
        .from(questionsTable)
        .where(eq(questionsTable.bank_id, input.bankId))

      if (questions.length === 0) {
        throw new TRPCError({
          code: `BAD_REQUEST`,
          message: `Question bank has no questions`,
        })
      }

      // Check if slug is already taken, if so, uniquify it
      let finalSlug = input.slug
      const existingSession = await ctx.db
        .select()
        .from(gameSessionsTable)
        .where(eq(gameSessionsTable.slug, input.slug))

      if (existingSession.length > 0) {
        // Find a unique slug by appending a number
        let counter = 1
        while (true) {
          const testSlug = `${input.slug}-${counter}`
          const exists = await ctx.db
            .select()
            .from(gameSessionsTable)
            .where(eq(gameSessionsTable.slug, testSlug))

          if (exists.length === 0) {
            finalSlug = testSlug
            break
          }
          counter++
        }
      }

      const result = await ctx.db.transaction(async (tx) => {
        const txid = await generateTxId(tx)

        const [newSession] = await tx
          .insert(gameSessionsTable)
          .values({
            slug: finalSlug,
            bank_id: input.bankId,
            admin_id: ctx.session.user.id,
            status: `lobby`,
            round_duration_seconds: input.roundDurationSeconds,
          })
          .returning()

        return { item: newSession, txid }
      })

      return result
    }),

  // Update session settings (while in lobby)
  update: adminProcedure
    .input(
      z.object({
        id: z.number(),
        roundDurationSeconds: z.number().min(10).max(120).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input

      // Verify session exists and belongs to admin
      const [session] = await ctx.db
        .select()
        .from(gameSessionsTable)
        .where(
          and(
            eq(gameSessionsTable.id, id),
            eq(gameSessionsTable.admin_id, ctx.session.user.id)
          )
        )

      if (!session) {
        throw new TRPCError({
          code: `NOT_FOUND`,
          message: `Game session not found`,
        })
      }

      if (session.status !== `lobby`) {
        throw new TRPCError({
          code: `BAD_REQUEST`,
          message: `Can only update session settings while in lobby`,
        })
      }

      const result = await ctx.db.transaction(async (tx) => {
        const txid = await generateTxId(tx)

        const updateData: Record<string, unknown> = {}
        if (data.roundDurationSeconds !== undefined) {
          updateData.round_duration_seconds = data.roundDurationSeconds
        }

        const [updated] = await tx
          .update(gameSessionsTable)
          .set(updateData)
          .where(eq(gameSessionsTable.id, id))
          .returning()

        return { item: updated, txid }
      })

      return result
    }),

  // Delete a session
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db.transaction(async (tx) => {
        const txid = await generateTxId(tx)

        const [deleted] = await tx
          .delete(gameSessionsTable)
          .where(
            and(
              eq(gameSessionsTable.id, input.id),
              eq(gameSessionsTable.admin_id, ctx.session.user.id)
            )
          )
          .returning()

        if (!deleted) {
          throw new TRPCError({
            code: `NOT_FOUND`,
            message: `Game session not found`,
          })
        }

        return { item: deleted, txid }
      })

      return result
    }),
})
