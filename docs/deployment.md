# Deployment

companyPlan now runs as a production data service, not a static GitHub Pages site.

## Runtime

- Frontend: Vite build output in `dist/`.
- Backend: Node/Express API in `server/index.mjs`.
- Database: SQLite at `COMPANYPLAN_DB_PATH` or `COMPANYPLAN_DATA_DIR/companyplan.sqlite`.
- Attachments: local files under `COMPANYPLAN_UPLOAD_DIR` or `COMPANYPLAN_DATA_DIR/uploads`.
- Auth: username/password login with HttpOnly session cookie.
- Permissions: enforced on the server for project, ticket, warning, gantt, attachment, and audit endpoints.

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

On an empty database, the server seeds the base companyPlan users, projects, demand tickets, project membership, attachment metadata, and an audit event.

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
```

`test:scenarios` starts an isolated production server on `COMPANYPLAN_SCENARIO_PORT` or `4274` with a temporary data directory and verifies real login, scoped rows, persisted tickets, attachment uploads, audit logging, read-only programmer gantt access, and admin-only gantt movement. Set `COMPANY_PLAN_URL` only when intentionally testing an existing server.

Manual smoke checks:

- Unauthenticated `/api/bootstrap` returns `401`.
- Admin can see global navigation and all ticket rows.
- Non-admin users only see `需求提单` navigation and scoped rows.
- Non-programmer users do not see `任务甘特图`.
- Programmer users see scoped gantt rows but cannot drag bars.
- Admin gantt drag changes only visual offset and writes an audit event.
