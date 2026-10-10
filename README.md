# EduManage AI — School Management System

Principal-facing school management: students, teachers, classes, curriculum, attendance,
fees, results, exams — plus an **AI School Assistant** that answers questions and prepares
actions (like emailing parents about overdue fees) that run only after the principal approves them.

- **Web:** React 18 + Vite + React Router + TanStack Query (`apps/web`) — http://localhost:5173
- **API:** Node 22 + Express 5 + zod (`apps/api`) — http://localhost:4000
- **Database:** MySQL 8

See [docs/architecture.md](docs/architecture.md) for how the code is organised.

## Setup

```bash
# 1. Install dependencies (root + both apps)
npm run setup

# 2. Database (any MySQL 8 works; this starts one in Docker on port 3307)
npm run db:up

# 3. Configure the API
cp apps/api/.env.example apps/api/.env
#    set DB_PORT=3307, DB_PASSWORD=schoolroot, a random JWT_SECRET,
#    and optionally GROQ_API_KEY and SMTP_* (see below)

# 4. Create tables, add demo data (optional), run everything
npm run migrate
npm run seed
npm run dev        # starts API and web together
```

Log in with `DEFAULT_PRINCIPAL_EMAIL` / `DEFAULT_PRINCIPAL_PASSWORD`
(development default: `admin@school.com` / `admin123`).

## Scripts (run from the repo root)

| Command                               | What it does                                                             |
| ------------------------------------- | ------------------------------------------------------------------------ |
| `npm run dev`                         | API (auto-restart) + web dev server together                             |
| `npm run dev:api` / `npm run dev:web` | Just one of them                                                         |
| `npm test`                            | API tests on `school_management_test` — never touches your real database |
| `npm run migrate`                     | Apply new SQL migrations (`apps/api/src/db/migrations`)                  |
| `npm run seed`                        | Demo data (empty database only)                                          |
| `npm run build`                       | Production build of the web app                                          |
| `npm run db:up`                       | Start the local MySQL container                                          |

## AI School Assistant (AI Center)

Chat in plain language, e.g.:

- "Email the parents whose fees are due"
- "Email parents of students absent 3 days in a row"
- "Who needs attention this week?"
- "Add Bilal Ahmed to Class 6, father Ahmed Shah, ahmed.shah@example.com"
- "Record a payment of 150 for Usman"
- "Make a 10-question maths test for Class 5"

Anything that sends or changes something appears as a card with the full preview (every
recipient and the exact email text) and **Approve / Reject** buttons. Nothing happens until you
approve, and what you approve is exactly what runs.

| Setting (`apps/api/.env`)                                    | Effect                                                                                                  |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `GROQ_API_KEY` (free) / `OPENAI_API_KEY` / `USE_OLLAMA=true` | Enables the AI model. Without one, built-in rules handle common requests (incl. fee/attendance emails). |
| `AGENT_MODEL`                                                | Override the model (Groq default `openai/gpt-oss-120b`).                                                |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM`      | Real email delivery. If unset, emails are **simulated** (recorded, not delivered).                      |
| `EMAIL_REDIRECT_TO`                                          | Testing: send every email to this address instead of parents.                                           |
