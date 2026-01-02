import { router, adminProcedure, generateTxId } from "@/lib/trpc"
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { eq, desc } from "drizzle-orm"
import {
  questionBanksTable,
  createQuestionBankSchema,
  questionsTable,
} from "@/db/schema"

export const questionBanksRouter = router({
  // List all question banks
  list: adminProcedure.query(async ({ ctx }) => {
    const banks = await ctx.db
      .select()
      .from(questionBanksTable)
      .orderBy(desc(questionBanksTable.updated_at))
    return banks
  }),

  // Get a single question bank by ID
  get: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const [bank] = await ctx.db
        .select()
        .from(questionBanksTable)
        .where(eq(questionBanksTable.id, input.id))

      if (!bank) {
        throw new TRPCError({
          code: `NOT_FOUND`,
          message: `Question bank not found`,
        })
      }

      return bank
    }),

  // Get question count for a bank
  getQuestionCount: adminProcedure
    .input(z.object({ bankId: z.number() }))
    .query(async ({ ctx, input }) => {
      const questions = await ctx.db
        .select()
        .from(questionsTable)
        .where(eq(questionsTable.bank_id, input.bankId))

      return questions.length
    }),

  // Create a new question bank
  create: adminProcedure
    .input(createQuestionBankSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db.transaction(async (tx) => {
        const txid = await generateTxId(tx)
        const [newBank] = await tx
          .insert(questionBanksTable)
          .values(input)
          .returning()
        return { item: newBank, txid }
      })

      return result
    }),

  // Update a question bank
  update: adminProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input

      const result = await ctx.db.transaction(async (tx) => {
        const txid = await generateTxId(tx)
        const [updatedBank] = await tx
          .update(questionBanksTable)
          .set({ ...data, updated_at: new Date() })
          .where(eq(questionBanksTable.id, id))
          .returning()

        if (!updatedBank) {
          throw new TRPCError({
            code: `NOT_FOUND`,
            message: `Question bank not found`,
          })
        }

        return { item: updatedBank, txid }
      })

      return result
    }),

  // Delete a question bank
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db.transaction(async (tx) => {
        const txid = await generateTxId(tx)
        const [deletedBank] = await tx
          .delete(questionBanksTable)
          .where(eq(questionBanksTable.id, input.id))
          .returning()

        if (!deletedBank) {
          throw new TRPCError({
            code: `NOT_FOUND`,
            message: `Question bank not found`,
          })
        }

        return { item: deletedBank, txid }
      })

      return result
    }),
})
