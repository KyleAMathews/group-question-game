import { createCollection } from "@tanstack/react-db"
import { electricCollectionOptions } from "@tanstack/electric-db-collection"
import {
  selectQuestionBankSchema,
  selectQuestionSchema,
  selectAnswerOptionSchema,
  selectGameSessionSchema,
  selectPlayerSchema,
  selectPlayerResponseSchema,
  selectUsedQuestionSchema,
  selectUsersSchema,
} from "@/db/schema"
import { trpc } from "@/lib/trpc-client"

const baseUrl =
  typeof window !== `undefined`
    ? window.location.origin
    : `http://localhost:5173`

// Users collection (for admin features)
export const usersCollection = createCollection(
  electricCollectionOptions({
    id: `users`,
    shapeOptions: {
      url: new URL(`/api/users`, baseUrl).toString(),
      parser: {
        timestamptz: (date: string) => new Date(date),
      },
    },
    schema: selectUsersSchema,
    getKey: (item) => item.id,
  })
)

// Question Banks collection (admin only)
export const questionBanksCollection = createCollection(
  electricCollectionOptions({
    id: `question-banks`,
    shapeOptions: {
      url: new URL(`/api/question-banks`, baseUrl).toString(),
      parser: {
        timestamptz: (date: string) => new Date(date),
      },
    },
    schema: selectQuestionBankSchema,
    getKey: (item) => item.id,
    onInsert: async ({ transaction }) => {
      const { modified: newBank } = transaction.mutations[0]
      const result = await trpc.questionBanks.create.mutate({
        name: newBank.name,
        description: newBank.description,
      })
      return { txid: result.txid }
    },
    onUpdate: async ({ transaction }) => {
      const { modified: updatedBank } = transaction.mutations[0]
      const result = await trpc.questionBanks.update.mutate({
        id: updatedBank.id,
        name: updatedBank.name,
        description: updatedBank.description,
      })
      return { txid: result.txid }
    },
    onDelete: async ({ transaction }) => {
      const { original: deletedBank } = transaction.mutations[0]
      const result = await trpc.questionBanks.delete.mutate({
        id: deletedBank.id,
      })
      return { txid: result.txid }
    },
  })
)

// Questions collection (admin only)
export const questionsCollection = createCollection(
  electricCollectionOptions({
    id: `questions`,
    shapeOptions: {
      url: new URL(`/api/questions`, baseUrl).toString(),
      parser: {
        timestamptz: (date: string) => new Date(date),
      },
    },
    schema: selectQuestionSchema,
    getKey: (item) => item.id,
  })
)

// Answer Options collection (admin only)
export const answerOptionsCollection = createCollection(
  electricCollectionOptions({
    id: `answer-options`,
    shapeOptions: {
      url: new URL(`/api/answer-options`, baseUrl).toString(),
    },
    schema: selectAnswerOptionSchema,
    getKey: (item) => item.id,
  })
)

// Used Questions collection - tracks which questions have been asked
export const usedQuestionsCollection = createCollection(
  electricCollectionOptions({
    id: `used-questions`,
    shapeOptions: {
      url: new URL(`/api/used-questions`, baseUrl).toString(),
      parser: {
        timestamptz: (date: string) => new Date(date),
      },
    },
    schema: selectUsedQuestionSchema,
    getKey: (item) => item.id,
  })
)

// Game Sessions collection - synced per slug
export const sessionsCollection = createCollection(
  electricCollectionOptions({
    id: `sessions`,
    shapeOptions: {
      url: new URL(`/api/sessions`, baseUrl).toString(),
      parser: {
        timestamptz: (date: string) => new Date(date),
      },
    },
    schema: selectGameSessionSchema,
    getKey: (item) => item.id,
  })
)

// Players collection - synced per session
export const playersCollection = createCollection(
  electricCollectionOptions({
    id: `players`,
    shapeOptions: {
      url: new URL(`/api/players`, baseUrl).toString(),
      parser: {
        timestamptz: (date: string) => new Date(date),
      },
    },
    schema: selectPlayerSchema,
    getKey: (item) => item.id,
  })
)

// Player Responses collection - for reveal phase
// Supports optimistic answer submissions
export const responsesCollection = createCollection(
  electricCollectionOptions({
    id: `responses`,
    shapeOptions: {
      url: new URL(`/api/responses`, baseUrl).toString(),
      parser: {
        timestamptz: (date: string) => new Date(date),
      },
    },
    schema: selectPlayerResponseSchema,
    getKey: (item) => item.id,
    onInsert: async ({ transaction }) => {
      const { modified: response } = transaction.mutations[0]
      // Server calculates actual points and may auto-reveal
      const result = await trpc.game.submitAnswer.mutate({
        playerId: response.player_id,
        sessionId: response.session_id,
        questionId: response.question_id,
        selectedOptionIds: response.selected_option_ids,
      })
      return { txid: result.txid }
    },
  })
)
