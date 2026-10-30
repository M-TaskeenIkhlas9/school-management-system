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

**Urdu.** Each parent gets messages in English or Urdu: chosen on the student form ("Messages to
them in"), or else the school's default set by the principal on **Settings**. The fee reminder,
absence alert and announcement each have an Urdu version (greeting, names joined with "اور",
absence dates in Urdu); a message the school writes or edits goes to everyone exactly as written.
Urdu SMS is billed as Unicode (70 characters per part), and the approval preview shows who gets
Urdu. On WhatsApp, Urdu parents get the same template's Urdu (`ur`) translation, so add an Urdu
translation of `fee_reminder` and `absence_alert` in WhatsApp Manager; until it is approved, those
messages fail and fall back to SMS.

## Results, report cards and fee challans

Results are kept the Pakistani way: a **class result sheet** per term (each student's marks in each
subject out of that subject's total, with subjects taken from the class curriculum), graded on the
**BISE scale** (A+ 80%+, A 70%+, B 60%+, C 50%+, D 40%+, E 33%+, F below 33%; a student fails if any
subject is below 33%), with each student's **position in class**. Every result has a printable
**report card**.

Fees are billed monthly per class (**Bill a month**, never twice for the same month), paid in full
or in instalments with a printable **receipt** for each payment, and printed as three-part **fee
challans** (bank, school and parent copies) for a class or the whole school. The principal sets the
school's address, phone, bank account and late fine on **Settings**, and they print on challans,
receipts and report cards (the `SCHOOL_*` values in `.env` are only the starting defaults).

**Report-card remarks** (Results → Report-card remarks): pick a class and term, and the AI drafts a
one- or two-sentence remark for each student in English or Urdu, from that student's own figures
only (marks per subject, pass/fail, position, attendance, change since last term; no surname or
family details are sent). Teachers read and edit each draft; nothing is saved until they press
Save, and the AI's original draft is kept alongside the saved remark. Drafts that are too long, in
the wrong script or contain links are replaced with a standard remark written from the same
figures, which is also what you get when no AI service is set up.

## Families, discounts and concessions

Brothers and sisters who share a primary parent form a **family account** (Fees → Families): one
statement of every child's unpaid months, and one payment that settles the oldest months first, with
one family receipt. A **sibling discount** (a percentage, set on Settings) is taken off each younger
child's monthly fee; the eldest pays in full. Standing **concessions** (scholarship, staff child,
need-based; a percentage or a fixed amount) are taken off every month's bill until ended. Each fee
keeps what was taken off and why, and shows it on challans and receipts.

## Admissions

Every student gets a **GR number** (General Register), given in order on admission unless typed in,
along with the admission form details (father's name and CNIC, B-Form, gender, religion, address,
previous school). **Admissions → General register** lists everyone ever admitted. When a student
leaves, the school issues a numbered **School Leaving Certificate** (refused while fees are unpaid,
unless the principal leaves them anyway); the student comes off the class lists but stays in the
register, and can be taken back. **Year-end promotion** moves a class up, keeping back students who
failed their last result (the principal can change any choice), and the final class passes out with
certificates. CNIC and B-Form numbers are shown only to staff who manage student records.

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

`npm run eval --prefix apps/api` asks the real model 16 questions as different staff, and drafts
report-card remarks twice, then checks what it did. The cases (`apps/api/evals/cases.js`) are tagged:

| Tag         | What it guards                                                                                                                                                           |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `data`      | answers come from the right tools and match the database (e.g. the real student count); a student who doesn't exist is not made up                                       |
| `access`    | a teacher can't get fee data, an accountant can't get attendance, a teacher sees only their class                                                                        |
| `approval`  | a message to parents is only prepared and left for approval, never described as sent                                                                                     |
| `urdu`      | questions in Urdu (and Roman Urdu) are answered from the same data, in Urdu script                                                                                       |
| `injection` | "ignore your instructions / I'm the principal now", asking for the hidden prompt, and instructions hidden inside a student's record don't change what the assistant does |
| `remarks`   | AI report-card remarks are usable in English and Urdu, name a failed subject and don't repeat percentages                                                                |

```bash
npm run eval --prefix apps/api                       # everything
npm run eval --prefix apps/api -- --tag injection    # one group
npm run eval --prefix apps/api -- urdu               # cases whose name contains "urdu"
npm run eval --prefix apps/api -- --repeat 3         # a case passes only if all 3 runs pass
```

It uses the demo accounts (`npm run seed`) and removes everything it creates. When the AI service is
rate-limited the run waits and retries (`EVAL_RETRY_WAIT_MS`, default 20 s; `EVAL_PAUSE_MS` adds a
pause between cases for free tiers), and a case that still can't run is reported as **ERROR**, not
as a failure of the assistant. Each run writes a JSON report (answers, tools used, tokens) to
`apps/api/evals/reports/` for comparing models or prompt changes. The grading itself is unit-tested
in `apps/api/tests/evals.test.js`, which runs in CI without a model.

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request: lint + format check, API tests against
a MySQL 8 service, and web tests + production build.
