import { router, publicProcedure, generateTxId } from "@/lib/trpc"
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { eq, and } from "drizzle-orm"
import { gameSessionsTable, playersTable } from "@/db/schema"
import { randomUUID } from "crypto"

export const playersRouter = router({
  // Join a game session
  join: publicProcedure
    .input(
      z.object({
        sessionId: z.number(),
        displayName: z.string().min(3).max(50),
        playerId: z.string().optional(), // For rejoin
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify session exists and is in lobby
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

      if (session.status !== `lobby`) {
        throw new TRPCError({
          code: `BAD_REQUEST`,
          message: `Cannot join a game that has already started`,
        })
      }

      // Check if name is unique within session
      const existingPlayers = await ctx.db
        .select()
        .from(playersTable)
        .where(eq(playersTable.session_id, input.sessionId))

      const nameTaken = existingPlayers.some(
        (p) =>
          p.display_name.toLowerCase() === input.displayName.toLowerCase() &&
          p.id !== input.playerId
      )

      if (nameTaken) {
        throw new TRPCError({
          code: `CONFLICT`,
          message: `This name is already taken. Please choose a different name.`,
        })
      }

      // If playerId provided, try to rejoin
      if (input.playerId) {
        const existingPlayer = existingPlayers.find(
          (p) => p.id === input.playerId
        )
        if (existingPlayer) {
          // Update player name and reconnect
          const result = await ctx.db.transaction(async (tx) => {
            const txid = await generateTxId(tx)

            const [updated] = await tx
              .update(playersTable)
              .set({
                display_name: input.displayName,
                is_connected: true,
                last_seen_at: new Date(),
              })
              .where(eq(playersTable.id, input.playerId!))
              .returning()

            return { player: updated, txid }
          })

          return result
        }
      }

      // Create new player
      const playerId = input.playerId || randomUUID()

      const result = await ctx.db.transaction(async (tx) => {
        const txid = await generateTxId(tx)

        const [newPlayer] = await tx
          .insert(playersTable)
          .values({
            id: playerId,
            session_id: input.sessionId,
            display_name: input.displayName,
          })
          .returning()

        return { player: newPlayer, txid }
      })

      return result
    }),

  // Rejoin an existing session (for when player returns)
  rejoin: publicProcedure
    .input(
      z.object({
        playerId: z.string(),
        sessionId: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Find the player
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

      // Verify session exists
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

      // Mark player as connected
      const result = await ctx.db.transaction(async (tx) => {
        const txid = await generateTxId(tx)

        const [updated] = await tx
          .update(playersTable)
          .set({
            is_connected: true,
            last_seen_at: new Date(),
          })
          .where(eq(playersTable.id, input.playerId))
          .returning()

        return { player: updated, session, txid }
      })

      return result
    }),

  // Heartbeat to update last_seen_at
  heartbeat: publicProcedure
    .input(z.object({ playerId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db.transaction(async (tx) => {
        const txid = await generateTxId(tx)

        const [updated] = await tx
          .update(playersTable)
          .set({
            last_seen_at: new Date(),
            is_connected: true,
          })
          .where(eq(playersTable.id, input.playerId))
          .returning()

        if (!updated) {
          throw new TRPCError({
            code: `NOT_FOUND`,
            message: `Player not found`,
          })
        }

        return { txid }
      })

      return result
    }),

  // Mark player as disconnected
  disconnect: publicProcedure
    .input(z.object({ playerId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db.transaction(async (tx) => {
        const txid = await generateTxId(tx)

        await tx
          .update(playersTable)
          .set({
            is_connected: false,
            last_seen_at: new Date(),
          })
          .where(eq(playersTable.id, input.playerId))

        return { txid }
      })

      return result
    }),

  // Get players in a session
  listBySession: publicProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(async ({ ctx, input }) => {
      const players = await ctx.db
        .select()
        .from(playersTable)
        .where(eq(playersTable.session_id, input.sessionId))
        .orderBy(playersTable.joined_at)

      return players
    }),

  // Get a single player
  get: publicProcedure
    .input(z.object({ playerId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [player] = await ctx.db
        .select()
        .from(playersTable)
        .where(eq(playersTable.id, input.playerId))

      if (!player) {
        throw new TRPCError({
          code: `NOT_FOUND`,
          message: `Player not found`,
        })
      }

      return player
    }),
})
