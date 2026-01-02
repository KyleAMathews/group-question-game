import { router, adminProcedure, generateTxId } from "@/lib/trpc"
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { eq, desc } from "drizzle-orm"
import { generateText } from "ai"
import { anthropic } from "@ai-sdk/anthropic"
import { processImage } from "@/lib/image-processing"
import {
  questionsTable,
  answerOptionsTable,
  questionBanksTable,
} from "@/db/schema"

// Input schema for creating a question with its answer options
const createQuestionInput = z.object({
  bank_id: z.number(),
  question_text: z.string().min(1),
  question_type: z.enum([`single`, `multi`]).default(`single`),
  explanation: z.string().nullable().optional(),
  options: z
    .array(
      z.object({
        option_text: z.string().min(1),
        is_correct: z.boolean(),
        display_order: z.number().optional(),
      })
    )
    .min(2)
    .max(6),
})

// Input schema for updating a question
const updateQuestionInput = z.object({
  id: z.number(),
  question_text: z.string().min(1).optional(),
  question_type: z.enum([`single`, `multi`]).optional(),
  explanation: z.string().nullable().optional(),
  options: z
    .array(
      z.object({
        id: z.number().optional(), // Existing option ID
        option_text: z.string().min(1),
        is_correct: z.boolean(),
        display_order: z.number().optional(),
      })
    )
    .min(2)
    .max(6)
    .optional(),
})

export const questionsRouter = router({
  // List questions in a bank
  listByBank: adminProcedure
    .input(z.object({ bankId: z.number() }))
    .query(async ({ ctx, input }) => {
      // Get all questions for the bank
      const questions = await ctx.db
        .select()
        .from(questionsTable)
        .where(eq(questionsTable.bank_id, input.bankId))
        .orderBy(desc(questionsTable.created_at))

      // Get all options for these questions
      const questionIds = questions.map((q) => q.id)
      if (questionIds.length === 0) return []

      const allOptions = await ctx.db
        .select()
        .from(answerOptionsTable)
        .where(
          questionIds.length === 1
            ? eq(answerOptionsTable.question_id, questionIds[0])
            : undefined
        )

      // Filter options by question IDs
      const optionsByQuestionId = allOptions
        .filter((o) => questionIds.includes(o.question_id))
        .reduce(
          (acc, opt) => {
            if (!acc[opt.question_id]) {
              acc[opt.question_id] = []
            }
            acc[opt.question_id].push(opt)
            return acc
          },
          {} as Record<number, typeof allOptions>
        )

      // Combine questions with their options
      return questions.map((q) => ({
        ...q,
        options: (optionsByQuestionId[q.id] || []).sort(
          (a, b) => a.display_order - b.display_order
        ),
      }))
    }),

  // Get a single question with options
  get: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const [question] = await ctx.db
        .select()
        .from(questionsTable)
        .where(eq(questionsTable.id, input.id))

      if (!question) {
        throw new TRPCError({
          code: `NOT_FOUND`,
          message: `Question not found`,
        })
      }

      const options = await ctx.db
        .select()
        .from(answerOptionsTable)
        .where(eq(answerOptionsTable.question_id, input.id))
        .orderBy(answerOptionsTable.display_order)

      return { ...question, options }
    }),

  // Create a new question with options
  create: adminProcedure
    .input(createQuestionInput)
    .mutation(async ({ ctx, input }) => {
      // Verify bank exists
      const [bank] = await ctx.db
        .select()
        .from(questionBanksTable)
        .where(eq(questionBanksTable.id, input.bank_id))

      if (!bank) {
        throw new TRPCError({
          code: `NOT_FOUND`,
          message: `Question bank not found`,
        })
      }

      // Validate: at least one correct answer
      const hasCorrectAnswer = input.options.some((o) => o.is_correct)
      if (!hasCorrectAnswer) {
        throw new TRPCError({
          code: `BAD_REQUEST`,
          message: `At least one answer must be marked as correct`,
        })
      }

      const result = await ctx.db.transaction(async (tx) => {
        const txid = await generateTxId(tx)

        // Create the question
        const [newQuestion] = await tx
          .insert(questionsTable)
          .values({
            bank_id: input.bank_id,
            question_text: input.question_text,
            question_type: input.question_type,
            explanation: input.explanation,
          })
          .returning()

        // Create the options
        const optionsWithOrder = input.options.map((opt, idx) => ({
          question_id: newQuestion.id,
          option_text: opt.option_text,
          is_correct: opt.is_correct,
          display_order: opt.display_order ?? idx,
        }))

        const newOptions = await tx
          .insert(answerOptionsTable)
          .values(optionsWithOrder)
          .returning()

        // Update the bank's updated_at
        await tx
          .update(questionBanksTable)
          .set({ updated_at: new Date() })
          .where(eq(questionBanksTable.id, input.bank_id))

        return { item: { ...newQuestion, options: newOptions }, txid }
      })

      return result
    }),

  // Update a question and its options
  update: adminProcedure
    .input(updateQuestionInput)
    .mutation(async ({ ctx, input }) => {
      const { id, options, ...questionData } = input

      const result = await ctx.db.transaction(async (tx) => {
        const txid = await generateTxId(tx)

        // Update the question
        const updateData: Record<string, unknown> = {
          ...questionData,
          updated_at: new Date(),
        }

        const [updatedQuestion] = await tx
          .update(questionsTable)
          .set(updateData)
          .where(eq(questionsTable.id, id))
          .returning()

        if (!updatedQuestion) {
          throw new TRPCError({
            code: `NOT_FOUND`,
            message: `Question not found`,
          })
        }

        // Update options if provided
        let updatedOptions
        if (options) {
          // Validate: at least one correct answer
          const hasCorrectAnswer = options.some((o) => o.is_correct)
          if (!hasCorrectAnswer) {
            throw new TRPCError({
              code: `BAD_REQUEST`,
              message: `At least one answer must be marked as correct`,
            })
          }

          // Delete existing options and insert new ones
          await tx
            .delete(answerOptionsTable)
            .where(eq(answerOptionsTable.question_id, id))

          const optionsWithOrder = options.map((opt, idx) => ({
            question_id: id,
            option_text: opt.option_text,
            is_correct: opt.is_correct,
            display_order: opt.display_order ?? idx,
          }))

          updatedOptions = await tx
            .insert(answerOptionsTable)
            .values(optionsWithOrder)
            .returning()
        } else {
          updatedOptions = await tx
            .select()
            .from(answerOptionsTable)
            .where(eq(answerOptionsTable.question_id, id))
        }

        // Update the bank's updated_at
        await tx
          .update(questionBanksTable)
          .set({ updated_at: new Date() })
          .where(eq(questionBanksTable.id, updatedQuestion.bank_id))

        return { item: { ...updatedQuestion, options: updatedOptions }, txid }
      })

      return result
    }),

  // Delete a question
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db.transaction(async (tx) => {
        const txid = await generateTxId(tx)

        const [deletedQuestion] = await tx
          .delete(questionsTable)
          .where(eq(questionsTable.id, input.id))
          .returning()

        if (!deletedQuestion) {
          throw new TRPCError({
            code: `NOT_FOUND`,
            message: `Question not found`,
          })
        }

        // Update the bank's updated_at
        await tx
          .update(questionBanksTable)
          .set({ updated_at: new Date() })
          .where(eq(questionBanksTable.id, deletedQuestion.bank_id))

        return { item: deletedQuestion, txid }
      })

      return result
    }),

  // Upload image for a question with Sharp processing
  uploadImage: adminProcedure
    .input(
      z.object({
        questionId: z.number(),
        imageBase64: z.string(),
        mimeType: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Process the image with Sharp: resize and convert to WebP
      let processedData: string
      let processedMimeType: string

      try {
        const processed = await processImage(input.imageBase64, {
          maxWidth: 800,
          maxHeight: 600,
          quality: 80,
        })
        processedData = processed.data
        processedMimeType = processed.mimeType
      } catch (error) {
        console.error(`Image processing error:`, error)
        // Fall back to original image if processing fails
        processedData = input.imageBase64.replace(/^data:image\/\w+;base64,/, ``)
        processedMimeType = input.mimeType
      }

      const result = await ctx.db.transaction(async (tx) => {
        const txid = await generateTxId(tx)

        const [updated] = await tx
          .update(questionsTable)
          .set({
            image_data: processedData,
            image_mime_type: processedMimeType,
            updated_at: new Date(),
          })
          .where(eq(questionsTable.id, input.questionId))
          .returning()

        if (!updated) {
          throw new TRPCError({
            code: `NOT_FOUND`,
            message: `Question not found`,
          })
        }

        return { txid }
      })

      return result
    }),

  // Remove image from a question
  removeImage: adminProcedure
    .input(z.object({ questionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db.transaction(async (tx) => {
        const txid = await generateTxId(tx)

        const [updated] = await tx
          .update(questionsTable)
          .set({
            image_data: null,
            image_mime_type: null,
            updated_at: new Date(),
          })
          .where(eq(questionsTable.id, input.questionId))
          .returning()

        if (!updated) {
          throw new TRPCError({
            code: `NOT_FOUND`,
            message: `Question not found`,
          })
        }

        return { txid }
      })

      return result
    }),

  // Generate wrong answers using AI
  generateWrongAnswers: adminProcedure
    .input(
      z.object({
        questionText: z.string().min(1),
        correctAnswers: z.array(z.string()).min(1),
        count: z.number().min(1).max(5).default(3),
      })
    )
    .mutation(async ({ input }) => {
      const { questionText, correctAnswers, count } = input

      const prompt = `You are helping create a family-friendly trivia game. Generate ${count} plausible but INCORRECT answers for the following question.

Question: ${questionText}
Correct answer(s): ${correctAnswers.join(`, `)}

Requirements:
- Generate exactly ${count} wrong answers
- Make them plausible enough to be tricky but not too obscure
- Keep them family-friendly (no offensive, violent, or inappropriate content)
- Don't repeat the correct answer(s) or variations of them
- Make each wrong answer similar in length/style to the correct answer(s)
- Each wrong answer should be distinct from the others

Return ONLY the wrong answers, one per line, with no numbering, bullets, or extra formatting.`

      try {
        const result = await generateText({
          model: anthropic(`claude-sonnet-4-20250514`),
          prompt,
        })

        // Parse the response into individual wrong answers
        const wrongAnswers = result.text
          .split(`\n`)
          .map((line: string) => line.trim())
          .filter((line: string) => line.length > 0)
          .slice(0, count)

        if (wrongAnswers.length === 0) {
          throw new TRPCError({
            code: `INTERNAL_SERVER_ERROR`,
            message: `Failed to generate wrong answers`,
          })
        }

        return wrongAnswers
      } catch (error) {
        console.error(`AI generation error:`, error)
        throw new TRPCError({
          code: `INTERNAL_SERVER_ERROR`,
          message: `Failed to generate wrong answers. Make sure ANTHROPIC_API_KEY is configured.`,
        })
      }
    }),
})
