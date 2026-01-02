import { createFileRoute, Link } from "@tanstack/react-router"
import { useLiveQuery, eq } from "@tanstack/react-db"
import { questionBanksCollection, questionsCollection, answerOptionsCollection } from "@/lib/collections"
import { trpc } from "@/lib/trpc-client"
import { useState, useMemo } from "react"
import {
  ArrowLeft,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  ImageIcon,
  Sparkles,
} from "lucide-react"

interface OptionData {
  id: number
  option_text: string
  is_correct: boolean
  display_order: number
}

interface QuestionData {
  id: number
  question_text: string
  question_type: string
  explanation: string | null
  image_data: string | null
  image_mime_type: string | null
  options: OptionData[]
}

export const Route = createFileRoute(`/admin/banks/$bankId`)({
  component: BankDetailPage,
  loader: async () => {
    await Promise.all([
      questionBanksCollection.preload(),
      questionsCollection.preload(),
      answerOptionsCollection.preload(),
    ])
  },
})

function BankDetailPage() {
  const { bankId } = Route.useParams()

  // Load bank via Electric
  const { data: banksData, isLoading: banksLoading } = useLiveQuery((q) =>
    q.from({ banks: questionBanksCollection })
      .where(({ banks }) => eq(banks.id, Number(bankId)))
  )
  const bank = banksData?.[0]

  // Load questions for this bank via Electric
  const { data: questionsData, isLoading: questionsLoading } = useLiveQuery((q) =>
    q.from({ questions: questionsCollection })
      .where(({ questions }) => eq(questions.bank_id, Number(bankId)))
  )

  // Load all answer options via Electric
  const { data: optionsData } = useLiveQuery((q) =>
    q.from({ options: answerOptionsCollection })
  )
  const allOptions = optionsData || []

  // Join questions with their options client-side
  const questions: QuestionData[] = useMemo(() => {
    if (!questionsData) return []
    return questionsData.map((q) => ({
      ...q,
      options: allOptions
        .filter((o) => o.question_id === q.id)
        .sort((a, b) => a.display_order - b.display_order) as OptionData[],
    }))
  }, [questionsData, allOptions])

  const [expandedQuestion, setExpandedQuestion] = useState<number | null>(null)
  const [showNewForm, setShowNewForm] = useState(false)

  const isLoading = banksLoading || questionsLoading

  const handleDeleteQuestion = async (questionId: number) => {
    if (!confirm(`Are you sure you want to delete this question?`)) return
    try {
      await trpc.questions.delete.mutate({ id: questionId })
      // Electric will sync the deletion
    } catch (error) {
      console.error(`Failed to delete question:`, error)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="spinner" />
      </div>
    )
  }

  if (!bank) {
    return (
      <div className="text-center py-20">
        <p className="text-text-muted">Question bank not found</p>
        <Link to="/admin/banks" className="text-buzzy-purple hover:underline mt-4 inline-block">
          Back to Banks
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <Link to="/admin/banks" className="inline-flex items-center text-text-muted hover:text-buzzy-purple mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Banks
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-text-dark">{bank.name}</h1>
            {bank.description && (
              <p className="text-text-muted mt-1">{bank.description}</p>
            )}
          </div>
          <button
            onClick={() => setShowNewForm(true)}
            className="btn-primary btn-sm inline-flex items-center"
          >
            <Plus className="w-5 h-5 mr-2" />
            Add Question
          </button>
        </div>
      </div>

      {/* New Question Form */}
      {showNewForm && (
        <NewQuestionForm
          bankId={Number(bankId)}
          onClose={() => setShowNewForm(false)}
          onCreated={() => setShowNewForm(false)}
        />
      )}

      {/* Questions List */}
      {questions.length === 0 ? (
        <div className="card-buzzy text-center py-12">
          <p className="text-text-muted mb-4">No questions in this bank yet</p>
          <button
            onClick={() => setShowNewForm(true)}
            className="btn-primary"
          >
            <Plus className="w-5 h-5 mr-2" />
            Add Your First Question
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {questions.map((question, idx) => (
            <QuestionCard
              key={question.id}
              question={question}
              index={idx + 1}
              isExpanded={expandedQuestion === question.id}
              onToggle={() => setExpandedQuestion(
                expandedQuestion === question.id ? null : question.id
              )}
              onDelete={() => handleDeleteQuestion(question.id)}
              onUpdated={() => {}}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function QuestionCard({
  question,
  index,
  isExpanded,
  onToggle,
  onDelete,
  onUpdated,
}: {
  question: QuestionData
  index: number
  isExpanded: boolean
  onToggle: () => void
  onDelete: () => void
  onUpdated: () => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const correctCount = question.options.filter((o) => o.is_correct).length

  return (
    <div className="card-buzzy">
      <div
        className="flex items-start gap-4 cursor-pointer"
        onClick={onToggle}
      >
        <span className="w-8 h-8 rounded-full bg-buzzy-purple/10 flex items-center justify-center text-buzzy-purple font-bold text-sm flex-shrink-0">
          {index}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-medium text-text-dark">{question.question_text}</p>
              <div className="flex items-center gap-3 mt-2 text-sm text-text-muted">
                <span className={question.question_type === `multi` ? `text-buzzy-purple` : ``}>
                  {question.question_type === `multi` ? `Multi-select` : `Single answer`}
                </span>
                <span>•</span>
                <span>{question.options.length} options</span>
                <span>•</span>
                <span>{correctCount} correct</span>
                {question.image_data && (
                  <>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <ImageIcon className="w-4 h-4" /> Has image
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {isExpanded ? (
                <ChevronUp className="w-5 h-5 text-text-muted" />
              ) : (
                <ChevronDown className="w-5 h-5 text-text-muted" />
              )}
            </div>
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-gray-200 animate-slide-down">
          {isEditing ? (
            <EditQuestionForm
              question={question}
              onCancel={() => setIsEditing(false)}
              onSaved={() => {
                setIsEditing(false)
                onUpdated()
              }}
            />
          ) : (
            <>
              {/* Image preview */}
              {question.image_data && (
                <div className="mb-4">
                  <img
                    src={`data:${question.image_mime_type};base64,${question.image_data}`}
                    alt="Question image"
                    className="max-w-md rounded-xl border border-gray-200"
                  />
                </div>
              )}

              {/* Options */}
              <div className="space-y-2 mb-4">
                {question.options
                  .sort((a, b) => a.display_order - b.display_order)
                  .map((option) => (
                    <div
                      key={option.id}
                      className={`p-3 rounded-xl ${
                        option.is_correct
                          ? `bg-state-correct/10 border-2 border-state-correct`
                          : `bg-gray-50 border-2 border-transparent`
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {option.is_correct && (
                          <Check className="w-4 h-4 text-state-correct flex-shrink-0" />
                        )}
                        <span className={option.is_correct ? `text-state-correct font-medium` : `text-text-dark`}>
                          {option.option_text}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>

              {/* Explanation */}
              {question.explanation && (
                <div className="mb-4 p-3 rounded-xl bg-buzzy-yellow/10 border border-buzzy-yellow/30">
                  <p className="text-sm font-medium text-text-dark">Explanation:</p>
                  <p className="text-sm text-text-muted mt-1">{question.explanation}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setIsEditing(true)
                  }}
                  className="btn-secondary btn-sm"
                >
                  <Edit2 className="w-4 h-4 mr-2" />
                  Edit
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete()
                  }}
                  className="btn-sm px-4 py-2 rounded-xl font-bold text-red-500 hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function NewQuestionForm({
  bankId,
  onClose,
  onCreated,
}: {
  bankId: number
  onClose: () => void
  onCreated: () => void
}) {
  const [questionText, setQuestionText] = useState(``)
  const [questionType, setQuestionType] = useState<`single` | `multi`>(`single`)
  const [explanation, setExplanation] = useState(``)
  const [options, setOptions] = useState([
    { text: ``, isCorrect: true },
    { text: ``, isCorrect: false },
    { text: ``, isCorrect: false },
    { text: ``, isCorrect: false },
  ])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState(``)

  const addOption = () => {
    setOptions([...options, { text: ``, isCorrect: false }])
  }

  const removeOption = (index: number) => {
    if (options.length <= 2) return
    setOptions(options.filter((_, i) => i !== index))
  }

  const updateOption = (index: number, updates: Partial<{ text: string; isCorrect: boolean }>) => {
    setOptions(options.map((opt, i) => (i === index ? { ...opt, ...updates } : opt)))
  }

  const handleGenerateWrongAnswers = async () => {
    const correctAnswers = options.filter((o) => o.isCorrect && o.text.trim())
    if (!questionText.trim() || correctAnswers.length === 0) {
      setError(`Enter a question and at least one correct answer first`)
      return
    }

    setIsGenerating(true)
    setError(``)

    try {
      const wrongAnswers = await trpc.questions.generateWrongAnswers.mutate({
        questionText,
        correctAnswers: correctAnswers.map((o) => o.text),
        count: 3,
      })

      // Fill in empty wrong answer slots
      let wrongIdx = 0
      setOptions(options.map((opt) => {
        if (!opt.isCorrect && !opt.text.trim() && wrongIdx < wrongAnswers.length) {
          return { ...opt, text: wrongAnswers[wrongIdx++] }
        }
        return opt
      }))
    } catch (err) {
      console.error(`Failed to generate wrong answers:`, err)
      setError(`Failed to generate wrong answers. Try again.`)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(``)

    const validOptions = options.filter((o) => o.text.trim())
    if (validOptions.length < 2) {
      setError(`At least 2 options required`)
      return
    }

    const hasCorrect = validOptions.some((o) => o.isCorrect)
    if (!hasCorrect) {
      setError(`At least one correct answer required`)
      return
    }

    setIsSubmitting(true)

    try {
      await trpc.questions.create.mutate({
        bank_id: bankId,
        question_text: questionText,
        question_type: questionType,
        explanation: explanation || null,
        options: validOptions.map((o, idx) => ({
          option_text: o.text,
          is_correct: o.isCorrect,
          display_order: idx,
        })),
      })
      onCreated()
    } catch (err) {
      console.error(`Failed to create question:`, err)
      setError(`Failed to create question`)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="card-buzzy animate-slide-down">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-bold text-text-dark">New Question</h3>
        <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
          <X className="w-5 h-5 text-text-muted" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Question text */}
        <div>
          <label className="block text-sm font-medium text-text-dark mb-2">
            Question
          </label>
          <textarea
            value={questionText}
            onChange={(e) => setQuestionText(e.target.value)}
            placeholder="Enter your trivia question..."
            className="input-buzzy min-h-[100px]"
            required
          />
        </div>

        {/* Question type */}
        <div>
          <label className="block text-sm font-medium text-text-dark mb-2">
            Answer Type
          </label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={questionType === `single`}
                onChange={() => setQuestionType(`single`)}
                className="accent-buzzy-purple"
              />
              <span>Single answer</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={questionType === `multi`}
                onChange={() => setQuestionType(`multi`)}
                className="accent-buzzy-purple"
              />
              <span>Multiple correct</span>
            </label>
          </div>
        </div>

        {/* Options */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-text-dark">
              Answer Options
            </label>
            <button
              type="button"
              onClick={handleGenerateWrongAnswers}
              disabled={isGenerating}
              className="btn-sm px-3 py-1 rounded-lg bg-buzzy-purple/10 text-buzzy-purple hover:bg-buzzy-purple/20 flex items-center gap-1"
            >
              <Sparkles className="w-4 h-4" />
              {isGenerating ? `Generating...` : `AI Generate Wrong Answers`}
            </button>
          </div>

          <div className="space-y-3">
            {options.map((option, idx) => (
              <div key={idx} className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => updateOption(idx, { isCorrect: !option.isCorrect })}
                  className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border-2 transition-colors ${
                    option.isCorrect
                      ? `bg-state-correct border-state-correct text-white`
                      : `border-gray-300 hover:border-buzzy-purple`
                  }`}
                >
                  {option.isCorrect && <Check className="w-4 h-4" />}
                </button>
                <input
                  type="text"
                  value={option.text}
                  onChange={(e) => updateOption(idx, { text: e.target.value })}
                  placeholder={option.isCorrect ? `Correct answer` : `Wrong answer`}
                  className="input-buzzy flex-1"
                />
                {options.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeOption(idx)}
                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addOption}
            className="mt-3 text-sm text-buzzy-purple hover:underline"
          >
            + Add another option
          </button>
        </div>

        {/* Explanation */}
        <div>
          <label className="block text-sm font-medium text-text-dark mb-2">
            Explanation (optional)
          </label>
          <textarea
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            placeholder="Why is this the correct answer?"
            className="input-buzzy"
          />
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-red-50 border-2 border-red-200">
            <p className="text-red-700 text-sm font-medium">{error}</p>
          </div>
        )}

        <div className="flex gap-3">
          <button type="submit" disabled={isSubmitting} className="btn-primary">
            {isSubmitting ? `Creating...` : `Create Question`}
          </button>
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

function EditQuestionForm({
  question,
  onCancel,
  onSaved,
}: {
  question: QuestionData
  onCancel: () => void
  onSaved: () => void
}) {
  const [questionText, setQuestionText] = useState(question.question_text)
  const [questionType, setQuestionType] = useState<`single` | `multi`>(
    question.question_type as `single` | `multi`
  )
  const [explanation, setExplanation] = useState(question.explanation || ``)
  const [options, setOptions] = useState(
    question.options.map((o) => ({
      id: o.id,
      text: o.option_text,
      isCorrect: o.is_correct,
    }))
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState(``)

  const addOption = () => {
    setOptions([...options, { id: 0, text: ``, isCorrect: false }])
  }

  const removeOption = (index: number) => {
    if (options.length <= 2) return
    setOptions(options.filter((_, i) => i !== index))
  }

  const updateOption = (index: number, updates: Partial<{ text: string; isCorrect: boolean }>) => {
    setOptions(options.map((opt, i) => (i === index ? { ...opt, ...updates } : opt)))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(``)

    const validOptions = options.filter((o) => o.text.trim())
    if (validOptions.length < 2) {
      setError(`At least 2 options required`)
      return
    }

    const hasCorrect = validOptions.some((o) => o.isCorrect)
    if (!hasCorrect) {
      setError(`At least one correct answer required`)
      return
    }

    setIsSubmitting(true)

    try {
      await trpc.questions.update.mutate({
        id: question.id,
        question_text: questionText,
        question_type: questionType,
        explanation: explanation || null,
        options: validOptions.map((o, idx) => ({
          option_text: o.text,
          is_correct: o.isCorrect,
          display_order: idx,
        })),
      })
      onSaved()
    } catch (err) {
      console.error(`Failed to update question:`, err)
      setError(`Failed to update question`)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Question text */}
      <div>
        <label className="block text-sm font-medium text-text-dark mb-2">
          Question
        </label>
        <textarea
          value={questionText}
          onChange={(e) => setQuestionText(e.target.value)}
          className="input-buzzy min-h-[80px]"
          required
        />
      </div>

      {/* Question type */}
      <div className="flex gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            checked={questionType === `single`}
            onChange={() => setQuestionType(`single`)}
            className="accent-buzzy-purple"
          />
          <span className="text-sm">Single answer</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            checked={questionType === `multi`}
            onChange={() => setQuestionType(`multi`)}
            className="accent-buzzy-purple"
          />
          <span className="text-sm">Multiple correct</span>
        </label>
      </div>

      {/* Options */}
      <div className="space-y-2">
        {options.map((option, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => updateOption(idx, { isCorrect: !option.isCorrect })}
              className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 border-2 transition-colors ${
                option.isCorrect
                  ? `bg-state-correct border-state-correct text-white`
                  : `border-gray-300 hover:border-buzzy-purple`
              }`}
            >
              {option.isCorrect && <Check className="w-3 h-3" />}
            </button>
            <input
              type="text"
              value={option.text}
              onChange={(e) => updateOption(idx, { text: e.target.value })}
              className="input-buzzy flex-1 py-2"
            />
            {options.length > 2 && (
              <button
                type="button"
                onClick={() => removeOption(idx)}
                className="p-1 text-red-500 hover:bg-red-50 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={addOption}
          className="text-sm text-buzzy-purple hover:underline"
        >
          + Add option
        </button>
      </div>

      {/* Explanation */}
      <div>
        <label className="block text-sm font-medium text-text-dark mb-2">
          Explanation
        </label>
        <textarea
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          className="input-buzzy"
        />
      </div>

      {error && (
        <p className="text-red-600 text-sm">{error}</p>
      )}

      <div className="flex gap-2">
        <button type="submit" disabled={isSubmitting} className="btn-primary btn-sm">
          {isSubmitting ? `Saving...` : `Save`}
        </button>
        <button type="button" onClick={onCancel} className="btn-sm px-4 py-2 rounded-xl font-bold text-text-muted hover:bg-gray-100">
          Cancel
        </button>
      </div>
    </form>
  )
}
