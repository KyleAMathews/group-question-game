import {
  boolean,
  integer,
  pgTable,
  timestamp,
  varchar,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { createSchemaFactory } from "drizzle-zod"
import { z } from "zod"
export * from "./auth-schema"
import { users } from "./auth-schema"

const { createInsertSchema, createSelectSchema, createUpdateSchema } =
  createSchemaFactory({ zodInstance: z })

// Question Banks - collections of trivia questions
export const questionBanksTable = pgTable(`question_banks`, {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: varchar({ length: 255 }).notNull(),
  description: text(),
  created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
})

// Questions - individual trivia questions
export const questionsTable = pgTable(`questions`, {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  bank_id: integer(`bank_id`)
    .notNull()
    .references(() => questionBanksTable.id, { onDelete: `cascade` }),
  question_text: text().notNull(),
  question_type: varchar({ length: 20 }).notNull().default(`single`), // "single" | "multi"
  image_data: text(), // Base64 encoded processed image
  image_mime_type: varchar({ length: 50 }), // e.g., "image/webp"
  explanation: text(), // Fun fact shown after reveal
  created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
})

// Answer Options - possible answers for each question
export const answerOptionsTable = pgTable(`answer_options`, {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  question_id: integer(`question_id`)
    .notNull()
    .references(() => questionsTable.id, { onDelete: `cascade` }),
  option_text: varchar({ length: 500 }).notNull(),
  is_correct: boolean().notNull().default(false),
  display_order: integer().notNull().default(0),
})

// Game Sessions - individual game instances
export const gameSessionsTable = pgTable(
  `game_sessions`,
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    slug: varchar({ length: 100 }).notNull(), // URL slug
    bank_id: integer(`bank_id`)
      .notNull()
      .references(() => questionBanksTable.id),
    admin_id: text(`admin_id`)
      .notNull()
      .references(() => users.id),
    status: varchar({ length: 20 }).notNull().default(`lobby`), // "lobby" | "active" | "revealing" | "ended"
    current_question_id: integer(`current_question_id`).references(
      () => questionsTable.id
    ),
    round_started_at: timestamp({ withTimezone: true }),
    round_duration_seconds: integer().notNull().default(30),
    winner_player_id: text(`winner_player_id`), // Set when game ends
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    ended_at: timestamp({ withTimezone: true }),
  },
  (table) => [uniqueIndex(`game_sessions_slug_idx`).on(table.slug)]
)

// Used Questions - tracks which questions have been asked in a session
export const usedQuestionsTable = pgTable(`used_questions`, {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  session_id: integer(`session_id`)
    .notNull()
    .references(() => gameSessionsTable.id, { onDelete: `cascade` }),
  question_id: integer(`question_id`)
    .notNull()
    .references(() => questionsTable.id),
  asked_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  question_order: integer().notNull(), // Order in which questions were asked
})

// Players - participants in a game session
export const playersTable = pgTable(`players`, {
  id: text().primaryKey(), // UUID stored in localStorage
  session_id: integer(`session_id`)
    .notNull()
    .references(() => gameSessionsTable.id, { onDelete: `cascade` }),
  display_name: varchar({ length: 50 }).notNull(),
  score: integer().notNull().default(0),
  is_connected: boolean().notNull().default(true),
  joined_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  last_seen_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
})

// Player Responses - answers submitted by players
export const playerResponsesTable = pgTable(`player_responses`, {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  player_id: text(`player_id`)
    .notNull()
    .references(() => playersTable.id, { onDelete: `cascade` }),
  session_id: integer(`session_id`)
    .notNull()
    .references(() => gameSessionsTable.id, { onDelete: `cascade` }),
  question_id: integer(`question_id`)
    .notNull()
    .references(() => questionsTable.id),
  selected_option_ids: integer().array().notNull().default([]),
  points_earned: integer().notNull().default(0),
  submitted_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
})

// Zod Schemas for Question Banks
export const selectQuestionBankSchema = createSelectSchema(questionBanksTable)
// Note: createInsertSchema automatically excludes generatedAlwaysAsIdentity columns
// .passthrough() ignores unknown keys (Zod v4 is strict by default)
export const createQuestionBankSchema = createInsertSchema(questionBanksTable)
  .omit({
    created_at: true,
    updated_at: true,
  })
  .passthrough()
export const updateQuestionBankSchema = createUpdateSchema(questionBanksTable)

// Zod Schemas for Questions
export const selectQuestionSchema = createSelectSchema(questionsTable)
export const createQuestionSchema = createInsertSchema(questionsTable)
  .omit({
    created_at: true,
    updated_at: true,
  })
  .passthrough()
export const updateQuestionSchema = createUpdateSchema(questionsTable)

// Zod Schemas for Answer Options
export const selectAnswerOptionSchema = createSelectSchema(answerOptionsTable)
export const createAnswerOptionSchema = createInsertSchema(answerOptionsTable)
export const updateAnswerOptionSchema = createUpdateSchema(answerOptionsTable)

// Zod Schemas for Game Sessions
export const selectGameSessionSchema = createSelectSchema(gameSessionsTable)
export const createGameSessionSchema = createInsertSchema(gameSessionsTable)
  .omit({
    created_at: true,
    ended_at: true,
    winner_player_id: true,
    current_question_id: true,
    round_started_at: true,
  })
  .passthrough()
export const updateGameSessionSchema = createUpdateSchema(gameSessionsTable)

// Zod Schemas for Used Questions
export const selectUsedQuestionSchema = createSelectSchema(usedQuestionsTable)
export const createUsedQuestionSchema = createInsertSchema(usedQuestionsTable)
  .omit({
    asked_at: true,
  })
  .passthrough()

// Zod Schemas for Players
export const selectPlayerSchema = createSelectSchema(playersTable)
export const createPlayerSchema = createInsertSchema(playersTable)
  .omit({
    score: true,
    is_connected: true,
    joined_at: true,
    last_seen_at: true,
  })
  .passthrough()
export const updatePlayerSchema = createUpdateSchema(playersTable)

// Zod Schemas for Player Responses
export const selectPlayerResponseSchema =
  createSelectSchema(playerResponsesTable)
export const createPlayerResponseSchema = createInsertSchema(playerResponsesTable)
  .omit({
    submitted_at: true,
  })
  .passthrough()

// TypeScript Types
export type QuestionBank = z.infer<typeof selectQuestionBankSchema>
export type Question = z.infer<typeof selectQuestionSchema>
export type AnswerOption = z.infer<typeof selectAnswerOptionSchema>
export type GameSession = z.infer<typeof selectGameSessionSchema>
export type UsedQuestion = z.infer<typeof selectUsedQuestionSchema>
export type Player = z.infer<typeof selectPlayerSchema>
export type PlayerResponse = z.infer<typeof selectPlayerResponseSchema>

// Session status type
export type SessionStatus = `lobby` | `active` | `revealing` | `ended`

// Question type
export type QuestionType = `single` | `multi`

// Users schema export
export const selectUsersSchema = createSelectSchema(users)
