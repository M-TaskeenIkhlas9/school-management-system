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
│   │   │   ├── transaction.js  inTransaction(work): commit or roll back as one
│   │   │   ├── migrate.js      applies migrations/NNN_*.sql once each (schema_migrations table)
│   │   │   ├── seed.js         demo data for an empty database
│   │   │   └── migrations/
│   │   ├── middleware/         auth (JWT, requireRole), validate (zod), errorHandler
│   │   ├── lib/                logger, audit, phone normalisation, pagination
│   │   ├── modules/<feature>/  <feature>.routes.js (HTTP + zod schema) and <feature>.service.js (logic + SQL)
│   │   ├── agent/              AI assistant harness: engine (loop), llm (provider), tools, actions, context
│   │   ├── messaging/          email / SMS / WhatsApp channels, templates, consent
│   │   └── jobs/               DB-backed job queue (sending, automations)
│   ├── evals/                  assistant quality checks against the real model (npm run eval)
│   └── tests/                  Jest + supertest, always against school_management_test
└── web/
    └── src/
        ├── main.jsx            providers: router, React Query, toasts, auth
        ├── app/                App.jsx (routes), AppLayout.jsx (sidebar/topbar), navItems.jsx
        ├── api/                client.js (single fetch wrapper), queries.js (cached data hooks)
        ├── auth/               AuthContext, LoginPage
        ├── components/         ErrorBoundary, Toast, PageHeader
        ├── lib/                format helpers, useLookups (id → name/class)
        ├── features/<page>/    one folder per page (dashboard, students, fees, …)
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
- **Multi-row writes use transactions** (student + enrollment, batch results, exam + questions, family payments,
  promotion, teacher class assignments). New code uses `inTransaction()` from `db/transaction.js`.
- **Dates:** "today" is `schoolToday()` (SCHOOL_TIMEZONE), never UTC `toISOString()` or MySQL `CURDATE()`.
- **Schema changes:** add `src/db/migrations/NNN_description.sql`, run `npm run migrate`.

## Frontend conventions

- Every page has a URL (`/students`, `/fees`, …); unknown paths redirect to `/dashboard`.
- All HTTP goes through `api/client.js`. A 401 with a stored token logs the user out.
- Reads use the hooks in `api/queries.js` (React Query cache, shared between pages).
  Writes use `useApiMutation`, which refreshes affected queries and shows a success/error toast —
  no write fails silently.

## Roles and access

- `modules/auth/permissions.js` is the single role → permission map (principal, admin, accountant,
  teacher). Permissions look like `fees:read` / `attendance:write`.
- `middleware/auth.js` reloads the user on every request, so deactivation or a role change applies
  immediately. Teachers carry the ids of their assigned classes (`teacher_classes`).
- `app.js` guards each section where it is mounted: `byMethod("x:read", "x:write")`.
  Inside modules, `classScope(req)`, `assertClassAccess` and `assertStudentAccess`
  (`middleware/access.js`) limit teachers to their classes; responses drop fee data for roles
  without `fees:read`.
- The web app gets permissions from `/auth/me` (`useAuth().can(...)`): navigation, routes, forms
  and data requests follow them, but the API remains the authority.
- `lib/audit.js` records logins, account changes and class assignments in `audit_log`.

## Guardians

`guardians` (E.164 phone, preferred channel, per-channel consent with timestamp) and
`student_guardians` (many-to-many, one primary per student). Saving a student with guardian
details reuses a parent matched by email, then phone. `lib/phone.js` normalises numbers
(`DEFAULT_COUNTRY_CODE`, default 92). Migrations can be `.sql` or `.js` (`export async function up(conn)`).

## AI assistant (agent harness)

```
POST /assistant/conversations/:id/messages        (Server-Sent Events back to the browser)
  └─ engine/runAgent
       ├─ prompt: school, today, user and role scope, currency; last 20 messages
       ├─ loop (≤ AGENT_MAX_STEPS model calls, AGENT_TIMEOUT_MS, AGENT_MAX_TOKENS):
       │    model.chat(messages, tools for this role)
       │    └─ for each tool call: exists? permitted? valid input? → run → shrink → {"data"|"error"}
       └─ save answer; run status completed | failed | cancelled | limit_reached
GET /assistant/runs/:id                             (trace: every model/tool step)
```

- `llm/`: `openaiCompatible.js` (plain HTTP, retries honour Retry-After / "try again in Xs"),
  `index.js` (presets, fallback model, `getModel`/`setModel`), `fakeModel.js` (scripted, for tests).
- `tools/`: each tool = `{ name, description, permission, input (zod), label(input), run(input, ctx) }`.
  Tools reuse the module services and the same access helpers as the HTTP routes, so a tool can never
  return more than the user could see in the app. Add a tool by adding it to one of the files and the
  registry picks it up.
- Tables: `agent_conversations`, `agent_messages`, `agent_runs`, `agent_run_steps`.
- Tool output is trimmed (`context/shrink.js`) and wrapped as `{"data": …}`; the prompt tells the
  model to treat it as data, never instructions.
- Read-only in M1. Next (M2): approval-gated actions, job queue, email/WhatsApp/SMS channels.
