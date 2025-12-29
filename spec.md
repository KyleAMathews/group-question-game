# BuzzIn - Synchronized Family Trivia Game

## Overview

BuzzIn is a real-time synchronized trivia game designed for family game nights. An admin creates a session, shares a URL, and family members join to answer questions together. The game features live synchronization, automatic scoring, and a celebratory winner reveal.

## Tech Stack

- **Framework:** TanStack Start
- **Client Data:** TanStack DB
- **Real-time Sync:** ElectricSQL (Electric Cloud)
- **Database:** Postgres (Neon)
- **Hosting:** Cloudflare
- **AI:** TanStack AI (for generating wrong answer options)
- **Image Processing:** Sharp
- **Authentication:** Google Auth (admin only)
- **Styling:** Tailwind CSS (fun and bright theme)

## User Roles

### Admin
- Authenticated via Google Auth
- Authorized emails stored in environment variable
- Can CRUD question banks and questions
- Can create and manage game sessions
- Can start/end games and control game flow

### Player
- No authentication required
- Joins via shared session URL
- Enters display name to participate

## Data Models

### Question Bank
- Name/theme (e.g., "Movie Trivia," "Family History")
- Shared among all admins (any admin can view/edit any bank)

### Question
- Belongs to a question bank
- Question text (required)
- 4 answer options (required)
- One or more correct answers marked
- Question type: single-answer or multi-select ("select all that apply")
- Image (optional, uploaded and processed)
- Explanation/fun fact (optional, shown after answer reveal)

### Session
- Admin-chosen URL slug (URL-safe characters, auto-uniquified if taken)
- Associated question bank
- Tracks which questions have been used (no repeats)
- Stores all player responses and scores
- Persisted indefinitely for history viewing

### Player (per session)
- Display name (min 3 characters, unique within session)
- User ID (generated, stored in localStorage for rejoin)
- Responses to each question
- Running score

## Game Flow

### Session Creation
1. Admin logs in via Google Auth
2. Admin creates new session:
   - Chooses URL slug
   - Selects question bank
3. System generates shareable URL and QR code
4. Admin shares URL/QR with players

### Lobby Phase
1. Players open session URL
2. Players enter display name (min 3 chars, must be unique)
3. Lobby screen shows all joined players
4. Players can rejoin if they close browser (localStorage user ID)
5. Admin sees "Start Game" button when ready
6. Players can only join during lobby phase (not mid-game)

### Active Game Phase
1. Admin clicks "Start Game"
2. Random question drawn from bank (not previously used this session)
3. All players see question simultaneously
4. Timer starts (fixed duration, ~30 seconds - tunable via testing)
5. Timer visible on screen
6. Players select answer(s) and submit
7. Round ends when:
   - All players have answered (auto-advance), OR
   - Timer expires, OR
   - Admin manually forces round to end
8. Answer reveal shows:
   - Correct answer(s)
   - What the player picked
   - Percentage of players who got it right
   - Explanation (if provided)
   - Players cannot see other individuals' specific answers
9. Admin clicks "Next Question" when ready (allows time for discussion)
10. Repeat until admin ends game

### Admin Controls During Game
- "Next Question" button (after answer reveal)
- "Force Show Answer" button (if someone left/disconnected)
- "End Game" button (jump to results anytime)

### Admin Disconnect Handling
- Game freezes until admin rejoins
- No admin transfer to players

### End Game
1. Admin clicks "End Game"
2. Winner announced with confetti animation and crown icon
3. Each player sees their own final score
4. Players do NOT see full leaderboard/rankings (just winner + own score)
5. Session preserved - players can return to URL later to see:
   - Winner
   - Their final score
   - Question-by-question breakdown of their answers

## Scoring

### Single-Answer Questions
- Correct: +1 point
- Wrong: 0 points

### Multi-Select Questions ("Select All That Apply")
- +1 point for each correct answer selected
- -1 point for each incorrect answer selected
- Question score can go negative
- Visual indicator that question is multi-select

## Question Management (Admin)

### Desktop View
- Table view of questions in a bank
- Inline editing supported
- Responsive (works on mobile too, but optimized for desktop)

### Creating Questions
1. Enter question text
2. Add at least one correct answer (required)
3. Add wrong answers as desired
4. Click "Generate Remaining" to have AI fill remaining slots to reach 4 options
5. Edit or regenerate AI suggestions as needed
6. Optionally upload image
7. Optionally add explanation/fun fact
8. Mark as single-answer or multi-select
9. Save to bank

### Image Handling
- Upload via form
- Processed and resized server-side with Sharp
- Stored in database (not external storage)

## API

### Authentication
- Token-based authentication via environment variable
- Same endpoints used by both web client and external API consumers
- Same validation rules applied everywhere

### Endpoints (Conceptual)
- CRUD operations for question banks
- CRUD operations for questions (supports batch creation)
- Questions can only be added to existing banks (no bank creation via API)

### Batch Import
- Accepts array of questions in single request
- Fields: question text, answers (with correct flags), bank ID, image (base64), explanation
- Returns created question IDs and any validation errors

## UI/UX

### Design
- Fun and bright color scheme
- Mobile-first responsive design
- Tailwind CSS
- Normal accessibility standards (WCAG compliance, color contrast, keyboard navigation)

### Player Screens (Mobile-Optimized)
1. Join screen (name entry)
2. Lobby (waiting for game start)
3. Question screen (question, options, timer)
4. Answer reveal screen
5. Final results screen
6. History view (for returning to completed sessions)

### Admin Screens
1. Login
2. Dashboard (banks list, sessions list)
3. Question bank management (table view)
4. Question editor (with AI assist)
5. Session creation
6. Session lobby (with QR code display)
7. Game control view (during active game)

### No Audio
- Silent operation - no sound effects
- Family provides the sound effects naturally

## Session URLs

### Format
- `/game/{admin-chosen-slug}`
- Slug: URL-safe characters only
- Auto-uniquified if slug already exists (silent append)

### QR Code
- Generated for each session
- Displayed in admin lobby view for easy scanning

## Configuration

### Environment Variables
- `ADMIN_EMAILS` - Comma-separated list of authorized admin email addresses
- `API_TOKEN` - Token for external API access
- Database connection strings
- ElectricSQL configuration
- Google OAuth credentials

## Infrastructure

| Component | Service |
|-----------|---------|
| Web App | Cloudflare |
| Real-time Sync | Electric Cloud |
| Database | Neon (Postgres) |

## Future Considerations (Out of Scope)

These items are explicitly not included in v1:
- Mid-game player joining
- Admin transfer
- Pause functionality
- Skip question without reveal
- Player kicking
- Sound effects
- Detailed stats (fastest answer, most improved, etc.)
- Full leaderboard during game
- AI-generated full questions
- AI-generated explanations
- Public/shareable question banks between families
