# EduManage AI — School Management System

Principal-facing school management: students, teachers, classes, curriculum, attendance,
fees, results, exams — plus an **AI School Assistant** that answers questions and prepares
actions (like emailing parents about overdue fees) that run only after the principal approves them.

- **Frontend:** React 18 + Vite (`client/`) — http://localhost:5173
- **Backend:** Node 22 + Express (`server/`) — http://localhost:4000
- **Database:** MySQL 8

## Setup

```bash
# 1. MySQL (any MySQL 8 works; this starts one in Docker on port 3307)
docker run -d --name school-mysql -e MYSQL_ROOT_PASSWORD=schoolroot -p 127.0.0.1:3307:3306 mysql:8.0

# 2. Backend
cd server
cp .env.example .env        # then fill in DB_*, JWT_SECRET (and optionally GROQ_API_KEY, SMTP_*)
npm install
npm run migrate             # creates the database and applies server/migrations/*.sql
npm run seed                # optional demo data (only on an empty database)
npm run dev

# 3. Frontend (new terminal)
cd client
npm install
npm run dev
```

Log in with the principal from `DEFAULT_PRINCIPAL_EMAIL` / `DEFAULT_PRINCIPAL_PASSWORD`
(development default: `admin@school.com` / `admin123`).

After a reboot: `docker start school-mysql`, then `npm run dev` in `server/` and `client/`.

## AI School Assistant (AI Center)

Chat in plain language, e.g.:

- "Email the parents whose fees are due"
- "Email parents of students absent 3 days in a row"
- "Who needs attention this week?"
- "Add Bilal Ahmed to Class 6, father Ahmed Shah, ahmed.shah@example.com"
- "Record a payment of 150 for Usman"
- "Make a 10-question maths test for Class 5"

How it works:

1. The agent (LangChain tool-calling) reads real data through **read tools**.
2. Anything that sends or changes something goes through a **propose tool**, which stores a
   *pending action* with a full preview (every recipient and the exact email text, fee
   allocations, generated questions…).
3. The principal clicks **Approve** or **Reject** on the card. Approval executes exactly the
   stored preview — the AI is not consulted again. Double approvals are refused, and pending
   actions expire after 24 h.
4. Every email is recorded in `email_outbox`; conversations, messages and actions are saved.

| Setting | Effect |
|---|---|
| `GROQ_API_KEY` (free) / `OPENAI_API_KEY` / `USE_OLLAMA=true` | Enables the AI model. Without one, a rule-based fallback handles common requests (incl. fee/attendance emails). |
| `AGENT_MODEL` | Override the model (Groq default `openai/gpt-oss-120b`). |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM` | Real email delivery. If unset, emails are **simulated** (recorded, not delivered). |
| `EMAIL_REDIRECT_TO` | Testing: send every email to this address instead of parents. |

Code: `server/agent/` (`harness.js` runs a turn, `tools.js`, `actions.js` propose/approve,
`store.js` persistence, `fallback.js`), `server/routes/agent.js`, `client/src/features/agent/`.

## Scripts (server)

| Command | What it does |
|---|---|
| `npm run dev` | API with auto-restart |
| `npm run migrate` | Apply new SQL migrations |
| `npm run seed` | Demo data (empty DB only) |
| `npm test` | Creates/migrates `school_management_test` and runs Jest there — never touches your real DB |

## Database changes

Add a new file `server/migrations/NNN_description.sql` and run `npm run migrate`.
Applied migrations are tracked in the `schema_migrations` table.
