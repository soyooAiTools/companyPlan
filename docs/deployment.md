# Deployment

companyPlan now runs as a production data service, not a static GitHub Pages site.

## Runtime

- Frontend: Vite build output in `apps/web/dist/`.
- Backend: Node/Express API composed by `apps/server/index.mjs`.
- Backend layers:
  - `apps/server/config/`: runtime environment and constants.
  - `apps/server/db/`: MySQL connection, schema, persistence, and audit storage.
  - `apps/server/service/`: business rules and authentication orchestration.
  - `apps/server/controller/`: Express request/response handling.
  - `apps/server/router/`: URL registration only.
  - `apps/server/middleware/`: session/auth and write-origin/security headers.
- Database: MySQL via `COMPANYPLAN_MYSQL_*` environment variables.
- Attachments: local files under `COMPANYPLAN_UPLOAD_DIR` or `COMPANYPLAN_DATA_DIR/uploads`.
- Auth: credentials are verified by soyoo `POST /tools/login`; companyPlan stores only the resulting identity and an HttpOnly session cookie.
- Permissions: enforced on the server for project, ticket, warning, gantt, attachment, and audit endpoints.
- Demand-ticket field storage: `source_project_name` stores `所属项目`; with Ops sync enabled this comes from `/ops/tenants`. `project_name` stores `项目名称`; with Ops sync enabled this comes from `/ops/projects`. `project_id` remains the internal permission mapping for the selected Ops project.

## Required Commands

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm migrate:sqlite:mysql  # only when migrating an existing legacy SQLite database into empty MySQL
pnpm start
```

The server listens on `PORT`, defaulting to `4174`.

## Environment

```bash
PORT=4174
COMPANYPLAN_DATA_DIR=/srv/companyplan/data
COMPANYPLAN_UPLOAD_DIR=/srv/companyplan/data/uploads
COMPANYPLAN_MYSQL_HOST=127.0.0.1
COMPANYPLAN_MYSQL_PORT=3306
COMPANYPLAN_MYSQL_USER=companyplan
COMPANYPLAN_MYSQL_PASSWORD=change-this-before-first-run
COMPANYPLAN_MYSQL_DATABASE=companyplan
COMPANYPLAN_MYSQL_CONNECTION_LIMIT=10
COMPANYPLAN_SEED_PASSWORD=change-this-before-first-run
COMPANYPLAN_COOKIE_SECURE=1
COMPANYPLAN_SESSION_DAYS=7
COMPANYPLAN_MAX_ATTACHMENT_BYTES=10485760
COMPANYPLAN_OPS_ENABLED=1
COMPANYPLAN_OPS_BASE_URL=https://helperapi.soyootech.com
COMPANYPLAN_OPS_CACHE_TTL_MS=600000
COMPANYPLAN_OPS_TIMEOUT_MS=12000
COMPANYPLAN_OPS_CONCURRENCY=8
COMPANYPLAN_OPS_PROJECT_MEMBER_LIMIT=0
COMPANYPLAN_OPS_INCLUDE_LOCAL_DATA=0
COMPANYPLAN_OPS_ADMIN_USERNAMES=
COMPANYPLAN_PLAYABLE_FEEDBACK_SERVICE_ID=soyoo-playable-helper
COMPANYPLAN_PLAYABLE_FEEDBACK_SHARED_SECRET=<与反馈后端一致的高强度随机密钥>
COMPANYPLAN_PLAYABLE_FEEDBACK_MAX_CLOCK_SKEW_SECONDS=300
```

Set `COMPANYPLAN_COOKIE_SECURE=1` when the app is served through HTTPS. If TLS is terminated by a reverse proxy, keep `X-Forwarded-Proto` configured correctly because the server trusts one proxy hop.

For local setup or isolated scenario tests, `COMPANYPLAN_MYSQL_CREATE_DATABASE=1` lets the app create the configured database when the MySQL user has permission. Do not rely on that privilege for production unless it is part of the database operations policy.

## soyoo Authentication And Realtime Integration

`POST /api/auth/login` forwards the submitted username and password to `${COMPANYPLAN_OPS_BASE_URL}/tools/login`. An invalid credential response is returned immediately: it must not trigger a full directory sync, user lookup, local upsert, or session creation. Upstream timeout/unavailability is returned as `502`, not disguised as a bad password.

反馈系统通过 `/api/internal/playable-feedback/*` 调用 companyPlan。该路由不接受浏览器会话，而是校验服务 ID、毫秒/秒时间戳、一次性 nonce 和请求原文 HMAC-SHA256。生产环境必须存在专用或兼容共享凭证；两者都缺失时接口返回 `503`。同一 `sourceAssignmentId` 只能映射一张工单，重复请求返回原工单，内容不同则返回 `409`。

现有部署若暂未增加专用密钥，会兼容回退到 `COMPANYPLAN_EXTERNAL_USERS_API_TOKEN`；helper 对应回退到 `external_api.token`。两端现有 token 必须一致。新部署仍应使用独立的 `COMPANYPLAN_PLAYABLE_FEEDBACK_SHARED_SECRET`，便于单独轮换和撤销。

After successful authentication only, companyPlan enriches the returned identity when tags are absent, upserts the `people` row, and creates the session. `is_admin`/`管理员` maps to `roleKey=admin`; the exact soyoo tag `制片` maps to `roleKey=producer`; all other accounts map to `member`. Session responses expose `username` and `roleKey` so downstream role-gated applications can admit only administrators and producers.

Passwords are neither persisted nor written to logs/audit metadata. The local `password_hash` remains a schema placeholder for login-created rows and is not used to validate production login.

The retired full-directory synchronizer must not be added back to the login path. Project, member, tenant, tag, and change-outbox data are read through the realtime clients in `apps/server/ops/`.

The field-level mapping contract is maintained in `docs/ops-field-mapping.md`. Update that document whenever Ops source fields, ticket field semantics, or imported directory behavior change.

The current production host keeps these values in `/srv/companyplan/companyplan.env` with `0600` permissions. PM2 starts `/srv/companyplan/start-companyplan.sh`, which sources that env file and then runs `node server/index.mjs`; this keeps database credentials out of PM2 command arguments.

Production MySQL currently runs as a local Podman container:

```text
container: companyplan-mysql
data: /srv/companyplan/mysql
bind: 127.0.0.1:3306
restart: always, with podman-restart.service enabled
```

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
MySQL database `companyplan`
uploads/
```

Use `mysqldump` or managed MySQL snapshots for the database, and back up `uploads/` separately. Keep MySQL credentials out of git and PM2 dumps.

Schema migrations run at server startup. Back up the database before deploying changes that alter ticket fields, including the `tickets.project_name` column used for `项目名称`.

## SQLite Migration

When upgrading an existing SQLite deployment, migrate once into an empty MySQL database before restarting PM2 on the MySQL-backed code:

```bash
backup_dir=/srv/companyplan/backups/$(date +%Y%m%d-%H%M%S)
mkdir -p "$backup_dir"
sqlite3 /srv/companyplan/data/companyplan.sqlite ".backup '$backup_dir/companyplan.sqlite'"
tar -C /srv/companyplan/data -czf "$backup_dir/uploads.tar.gz" uploads

COMPANYPLAN_SQLITE_PATH=/srv/companyplan/data/companyplan.sqlite \
COMPANYPLAN_MYSQL_CREATE_DATABASE=1 \
npm run migrate:sqlite:mysql
```

The migration command refuses to import into non-empty MySQL tables.

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

`test:scenarios` starts an isolated production server on `COMPANYPLAN_SCENARIO_PORT` or `4274` with a temporary upload directory and isolated MySQL database name. It sets `COMPANYPLAN_OPS_ENABLED=0` for deterministic seeded fixtures, then verifies real login, scoped rows, persisted tickets, seeded attachment open, admin `所属项目`/type-hour configuration, user-entered `项目名称` persistence, attachment upload/open/download, audit logging, read-only programmer gantt access, and admin-only gantt movement plus timeline length resizing. Set `COMPANY_PLAN_URL` only when intentionally testing an existing server.

Manual smoke checks:

- Unauthenticated `/api/bootstrap` returns `401`.
- With Ops sync enabled, the new-demand form shows `所属项目` as a tenant-backed select and `项目名称` as a project-backed select, with no `项目池` field.
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
