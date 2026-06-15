# Deployment

companyPlan now runs as a production data service, not a static GitHub Pages site.

## Runtime

- Frontend: Vite build output in `dist/`.
- Backend: Node/Express API composed by `server/index.mjs`.
- Backend layers:
  - `server/config/`: runtime environment and constants.
  - `server/db/`: SQLite connection, schema migration, seed materialization, scoped bootstrap reads, mapping, attachment persistence, and audit storage.
  - `server/dao/`: SQL helpers used by services.
  - `server/service/`: business rules, permission checks, mutations, and audit orchestration.
  - `server/controller/`: Express request/response handling.
  - `server/router/`: URL registration only.
  - `server/middleware/`: session/auth and write-origin/security headers.
- Database: SQLite at `COMPANYPLAN_DB_PATH` or `COMPANYPLAN_DATA_DIR/companyplan.sqlite`.
- Attachments: local files under `COMPANYPLAN_UPLOAD_DIR` or `COMPANYPLAN_DATA_DIR/uploads`.
- Auth: username/password login with HttpOnly session cookie.
- Permissions: enforced on the server for project, ticket, warning, gantt, attachment, and audit endpoints.
- Demand-ticket field storage: `source_project_name` stores the admin-managed `所属项目`; `project_name` stores the user-entered `项目名称`; `project_id` remains the internal permission mapping.

## Required Commands

```bash
npm install
npm run build
npm run start
```

The server listens on `PORT`, defaulting to `4174`.

## Environment

```bash
PORT=4174
COMPANYPLAN_DATA_DIR=/srv/companyplan/data
COMPANYPLAN_DB_PATH=/srv/companyplan/data/companyplan.sqlite
COMPANYPLAN_UPLOAD_DIR=/srv/companyplan/data/uploads
COMPANYPLAN_SEED_PASSWORD=change-this-before-first-run
COMPANYPLAN_COOKIE_SECURE=1
COMPANYPLAN_SESSION_DAYS=7
COMPANYPLAN_MAX_ATTACHMENT_BYTES=10485760
```

Set `COMPANYPLAN_COOKIE_SECURE=1` when the app is served through HTTPS. If TLS is terminated by a reverse proxy, keep `X-Forwarded-Proto` configured correctly because the server trusts one proxy hop.

## First Run

On an empty database, the server seeds the base companyPlan users, projects, demand tickets, project membership, stored demo attachment files, attachment metadata, and an audit event.

Seed usernames:

```text
admin, producer, artist, ui, model, animator, dev, sound
```

The initial password is `COMPANYPLAN_SEED_PASSWORD`, defaulting to `CompanyPlan@2026` only for local setup.

## Data Operations

Back up both:

```text
companyplan.sqlite
uploads/
```

For SQLite, prefer filesystem snapshots or `sqlite3 .backup` while the service is running. The database uses WAL mode, so backup procedures must account for `companyplan.sqlite-wal` and `companyplan.sqlite-shm` if copying raw files.

Schema migrations run at server startup. Back up the database before deploying changes that alter ticket fields, including the `tickets.project_name` column used for user-entered `项目名称`.

## Reverse Proxy

Serve the Node process behind HTTPS. The API remains under `/api/*`; the app serves built assets under both `/` and `/companyPlan/` because Vite production assets use the GitHub Pages base path.

Required headers from the proxy:

```text
X-Forwarded-Proto: https
X-Forwarded-For: <client-ip>
Host: <public-host>
```

## Verification

Before deployment:

```bash
npm run build
npm run test:scenarios
git diff --check
```

`test:scenarios` starts an isolated production server on `COMPANYPLAN_SCENARIO_PORT` or `4274` with a temporary data directory and verifies real login, scoped rows, persisted tickets, seeded attachment open, admin `所属项目`/type-hour configuration, user-entered `项目名称` persistence, attachment upload/open/download, audit logging, read-only programmer gantt access, and admin-only gantt movement plus timeline length resizing. Set `COMPANY_PLAN_URL` only when intentionally testing an existing server.

Manual smoke checks:

- Unauthenticated `/api/bootstrap` returns `401`.
- New-demand form shows `所属项目` as the admin-configured select and `项目名称` as a text input, with no `项目池` field.
- Admin can see global navigation and all ticket rows.
- Non-admin users only see `需求提单` navigation and scoped rows.
- Non-programmer users do not see `任务甘特图`.
- Programmer users see scoped gantt rows but cannot drag bars.
- Admin gantt drag changes visual offset/length and writes an audit event.

Production deploy from this checkout:

```bash
git pull --ff-only
npm install
npm run build
pm2 restart companyplan --update-env
pm2 status companyplan
```

Post-deploy HTTP checks:

```bash
curl -sS http://127.0.0.1:4174/api/health
curl -sS -i https://playcools.top/api/bootstrap
curl -sS https://playcools.top/companyPlan/ | rg -o 'assets/index-[^" ]+'
```

Unauthenticated `/api/bootstrap` must return `401`; `/companyPlan/` must serve the current Vite asset names.
