# Architecture

EduManage AI is a two-app monorepo: a React single-page app (`apps/web`) talking to an
Express JSON API (`apps/api`) backed by MySQL.

```
browser ──► apps/web (Vite, :5173) ──/api/*──► apps/api (Express, :4000) ──► MySQL
                                       (dev proxy strips /api)
```

## Repository layout

```
apps/
├── api/
│   ├── src/
│   │   ├── app.js              Express app: middleware + route mounting (no side effects)
│   │   ├── server.js           Entry point: config check, first principal, listen, graceful shutdown
│   │   ├── config/env.js       assertConfig(), schoolToday() (school-timezone date)
│   │   ├── db/
│   │   │   ├── pool.js         mysql2 connection pool
│   │   │   ├── migrate.js      applies migrations/NNN_*.sql once each (schema_migrations table)
│   │   │   ├── seed.js         demo data for an empty database
│   │   │   └── migrations/
│   │   ├── middleware/         auth (JWT, requireRole), validate (zod), errorHandler
│   │   ├── lib/email.js        SMTP or simulated email
│   │   ├── modules/<feature>/  <feature>.routes.js (HTTP + zod schema) and <feature>.service.js (logic + SQL)
│   │   └── agent/              AI assistant harness (see below)
│   └── tests/                  Jest + supertest, always against school_management_test
└── web/
    └── src/
        ├── main.jsx            providers: router, React Query, toasts, auth
        ├── app/                App.jsx (routes), AppLayout.jsx (sidebar/topbar), navItems.jsx
        ├── api/                client.js (single fetch wrapper), queries.js (cached data hooks)
        ├── auth/               AuthContext, LoginPage
        ├── components/         ErrorBoundary, Toast, PageHeader
        ├── lib/                format helpers, useLookups (id → name/class)
        ├── features/<page>/    one folder per page (dashboard, students, fees, agent, …)
        └── styles/global.css
docs/                           this file
docker-compose.yml              local MySQL
package.json                    root scripts: npm run dev / test / migrate / seed
```

## Backend conventions

- **One folder per feature.** Routes validate input and translate HTTP; services hold the rules
  and SQL. Routes never query the database directly.
- **Validation:** each routes file declares zod schemas and uses `validate(schema)`. Bodies are
  normalised before reaching services (numbers coerced, dates `YYYY-MM-DD`, empty form fields → `null`,
  unknown fields stripped). Route ids go through `idParam()`.
- **Errors:** throw `createError(status, message, code)`. Express 5 forwards async errors to
  `errorHandler`, which always responds `{ error, code, details? }`. No try/catch in routes.
- **Multi-row writes use transactions** (student + enrollment, batch results, exam + questions,
  insights refresh, agent action execution).
- **Dates:** "today" is `schoolToday()` (SCHOOL_TIMEZONE), never UTC `toISOString()` or MySQL `CURDATE()`.
- **Schema changes:** add `src/db/migrations/NNN_description.sql`, run `npm run migrate`.

## Frontend conventions

- Every page has a URL (`/students`, `/fees`, …); unknown paths redirect to `/dashboard`.
- All HTTP goes through `api/client.js`. A 401 with a stored token logs the user out.
- Reads use the hooks in `api/queries.js` (React Query cache, shared between pages).
  Writes use `useApiMutation`, which refreshes affected queries and shows a success/error toast —
  no write fails silently.

## AI assistant (agent harness)

```
POST /agent/conversations/:id/messages
  └─ harness.runTurn
       ├─ load last 20 messages + status of this conversation's actions
       ├─ LangChain agent (model from env) with tools.js
       │    ├─ read tools: stats, find_students, profiles, fee defaulters, attention report, …
       │    └─ propose_* tools ──► actions.js propose*() ──► agent_actions (status: pending, preview)
       ├─ fallback.js rule-based answers if no model is configured or the model call fails
       └─ save user + assistant messages
POST /agent/actions/:id/approve
  └─ claimPendingAction (atomic pending → executing; 24h expiry)
       └─ executor runs the stored payload exactly as previewed ──► executed / failed
            └─ result message appended to the conversation
```

Key properties:

- The model can never change data or send email directly; it can only create a pending action.
- What the principal approves is what runs: recipients and email text are resolved and stored at
  proposal time; approval does not consult the model again.
- A double click cannot execute an action twice (conditional UPDATE claim).
- Every email (sent, simulated or failed) is recorded in `email_outbox`.
- Data returned by tools is treated as data, not instructions (stated in the system prompt).

Action types: `send_guardian_emails`, `add_student`, `record_fee_payment`, `create_exam`.
To add one: write `propose<X>()` + `execute<X>()` in `actions.js`, register the executor in
`EXECUTORS`, expose a `propose_<x>` tool in `tools.js`, and add a preview component in
`apps/web/src/features/agent/ActionCard.jsx`.

### Model configuration

Provider is auto-detected: `USE_OLLAMA=true` → Ollama, else `GROQ_API_KEY` → Groq
(default `openai/gpt-oss-120b`), else `OPENAI_API_KEY` → OpenAI (`gpt-4o-mini`).
Override with `AGENT_PROVIDER` / `AGENT_MODEL`. Groq model availability varies by account — list
yours at `https://api.groq.com/openai/v1/models`.
