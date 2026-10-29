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
#    and optionally GROQ_API_KEY (used by the exam generator)

# 4. Create tables, add demo data (optional), run everything
npm run migrate
npm run seed
npm run dev        # starts API and web together
```

Log in with `DEFAULT_PRINCIPAL_EMAIL` / `DEFAULT_PRINCIPAL_PASSWORD`
(development default: `admin@school.com` / `admin123`).

## Scripts (run from the repo root)

| Command                                 | What it does                                                                  |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| `npm run dev`                           | API (auto-restart) + web dev server together                                  |
| `npm run dev:api` / `npm run dev:web`   | Just one of them                                                              |
| `npm test`                              | All tests: API (on `school_management_test` — never your real database) + web |
| `npm run test:api` / `npm run test:web` | Just one test suite                                                           |
| `npm run lint` / `npm run format`       | ESLint / Prettier (CI runs `lint` and `format:check`)                         |
| `npm run migrate`                       | Apply new SQL migrations (`apps/api/src/db/migrations`)                       |
| `npm run seed`                          | Demo data (empty database only) + dev demo accounts                           |
| `npm run build`                         | Production build of the web app                                               |
| `npm run db:up`                         | Start the local MySQL container                                               |

## Roles

| Role       | Can use                                                                     |
| ---------- | --------------------------------------------------------------------------- |
| Principal  | Everything, including user accounts and settings                            |
| Admin      | Students, teachers, classes, attendance, results, exams, reports (not fees) |
| Accountant | Fees and payments; student and class details needed to identify payers      |
| Teacher    | Only their assigned classes: students, attendance, results, exams (no fees) |

The API enforces every permission; the web app only shows what a role may use.

**Users & Access** (principal and admin) is where accounts are managed: create an account with a
generated temporary password (shown once), link a teacher account to its teacher record and pick
the classes they see, change roles, deactivate, reset a password or sign someone out everywhere.
Only a principal can create or change a principal, nobody can demote or deactivate themselves, and
the school always keeps one active principal. A reset password or "sign out everywhere" ends that
person's sessions immediately. The **Activity** tab shows sign-ins (including failed attempts),
account and class changes, and approvals. Everyone can change their own password under
**My account** (click your name in the sidebar).

`npm run seed` also creates **development-only** demo accounts (password `password123`, or
`DEMO_USER_PASSWORD`): `accountant@school.test`, `office@school.test` (admin) and
`teacher@school.test` (assigned to the first class).

## Parents and guardians

Guardians are their own records, linked to one or more students, so siblings share one parent.
Phone numbers are stored in international format (`03001234567` → `+923001234567`), each guardian
has a preferred channel (WhatsApp, SMS or email) and per-channel consent, which messaging will
respect.

## AI School Assistant (AI Center)

Ask questions in plain language — "Which parents have overdue fees?", "Who was absent today?",
"Which students need attention?". The assistant looks the answer up with tools, shows its progress
live, and every answer has a **Show steps** view of what it did (tools used, time, tokens).

- It only gets the tools your role allows, and every lookup is re-checked on the server: a teacher's
  assistant cannot see fees or other classes.
- It never acts on its own. Messages to parents and fee payments are **prepared** and shown as a
  card with the exact text for every parent; nothing happens until someone with permission approves
  (teachers draft, the principal or accountant approves). Pending items are also on **Approvals**,
  and every message sent is on **Outbox**.
- Model: any OpenAI-compatible service, set in `apps/api/.env` (`AI_PROVIDER=groq|openai|ollama`,
  optional `AI_MODEL`, `AI_FALLBACK_MODEL`). On Groq's free tier, expect roughly one question per
  minute (8,000 tokens/minute); rate-limit waits are retried automatically.

## Messaging parents (email, SMS, WhatsApp)

Each parent gets a message on their preferred channel, falling back along `CHANNEL_ORDER`
(default WhatsApp → SMS → email) to a channel they have agreed to. If a channel fails for good
(e.g. the number is not on WhatsApp), the same message is queued on their next channel. Messages
wait outside `QUIET_HOURS`, consent is re-checked at send time, and a parent replying **STOP**
withdraws consent for that channel (**START** restores it).

Every channel has a mode set in `apps/api/.env` (see `.env.example`):

| Channel  | Setting                                  | Real sending needs                                            |
| -------- | ---------------------------------------- | ------------------------------------------------------------- |
| Email    | live when `SMTP_HOST` is set             | SMTP server                                                   |
| SMS      | `SMS_PROVIDER=off\|simulated\|twilio`    | Twilio account SID, auth token, sender number                 |
| WhatsApp | `WHATSAPP_PROVIDER=off\|simulated\|meta` | WhatsApp Cloud API token, phone number ID, approved templates |

`simulated` records messages in the Outbox without sending them, so the whole flow can be tried
safely; `off` (the default for SMS and WhatsApp) routes nobody to that channel. WhatsApp messages the
school starts must use templates approved in WhatsApp Manager, named `fee_reminder` and
`absence_alert`, with body parameters in the order listed in `message_templates.whatsapp_params`.
Delivery receipts arrive at `/webhooks/twilio/status` and `/webhooks/whatsapp` (signed; set
`PUBLIC_BASE_URL`, `WHATSAPP_VERIFY_TOKEN` and `WHATSAPP_APP_SECRET`). For testing, `*_REDIRECT_TO`
sends everything to one address or number.

## Results, report cards and fee challans

Results are kept the Pakistani way: a **class result sheet** per term (each student's marks in each
subject out of that subject's total, with subjects taken from the class curriculum), graded on the
**BISE scale** (A+ 80%+, A 70%+, B 60%+, C 50%+, D 40%+, E 33%+, F below 33%; a student fails if any
subject is below 33%), with each student's **position in class**. Every result has a printable
**report card**.

Fees are billed monthly per class (**Bill a month**, never twice for the same month), paid in full
or in instalments with a printable **receipt** for each payment, and printed as three-part **fee
challans** (bank, school and parent copies) for a class or the whole school. Set `SCHOOL_ADDRESS`,
`SCHOOL_PHONE`, `SCHOOL_BANK_DETAILS` and `FEE_LATE_FINE` so they print on challans and report cards.

## Automations

**Automations** prepare messages to parents on a schedule, so routine reminders don't depend on
someone remembering: a weekly fee reminder, a daily absence alert, or an alert when a student has
missed several days in a row. Schedules follow the school's time zone (`SCHOOL_TIMEZONE`) and school
days (`SCHOOL_DAYS`, default Monday–Friday).

Each rule either **waits for approval** (the default: its messages appear on Approvals) or, if the
person who made it can approve messages, **sends automatically**. A run always acts as the rule's
creator with their current permissions, so a teacher's rule only reaches their own classes, and a
rule stops working if its creator's account is deactivated. Every run is recorded (sent, waiting,
skipped because nobody matched, or failed), and "Run now" tries a rule immediately.

## Assistant quality checks

`npm run eval --prefix apps/api` asks the real model a set of questions as different staff and checks
what it did: that answers come from the right tools, that a teacher can't get fee data or an
accountant attendance, and that a drafted message is left waiting for approval and never described
as sent. It uses the demo accounts (`npm run seed`) and removes everything it creates. Add cases in
`apps/api/evals/cases.js`.

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request: lint + format check, API tests against
a MySQL 8 service, and web tests + production build.
