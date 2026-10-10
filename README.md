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

The API enforces every permission; the web app only shows what a role may use. Accounts are
managed through `/users` (a management screen comes in M4), and teachers are assigned to classes
with `PUT /teachers/:id/classes`.

`npm run seed` also creates **development-only** demo accounts (password `password123`, or
`DEMO_USER_PASSWORD`): `accountant@school.test`, `office@school.test` (admin) and
`teacher@school.test` (assigned to the first class).

## Parents and guardians

Guardians are their own records, linked to one or more students, so siblings share one parent.
Phone numbers are stored in international format (`03001234567` → `+923001234567`), each guardian
has a preferred channel (WhatsApp, SMS or email) and per-channel consent, which messaging will
respect.

## AI School Assistant

Being rebuilt (milestones M1–M6): role-aware tools, approval before anything is sent or changed,
and WhatsApp, SMS and email delivery.

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request: lint + format check, API tests against
a MySQL 8 service, and web tests + production build.
