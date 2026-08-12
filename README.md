# companyPlan

Playable ad production SaaS for demand-ticket, project, permission, warning, attachment, audit, and gantt workflows.

Repository:

```text
https://github.com/soyooAiTools/companyPlan
```

## Scope

- Production data system with a Node API, MySQL database, HttpOnly session cookies, server-side row permissions, local attachment storage, and audit logging.
- The frontend never decides row-level permissions by itself. `/api/bootstrap` returns only data scoped to the logged-in account.
- KDocs/WPS-like demand-ticket table, kept intentionally lightweight.
- Demand ticket creation stores images, attachments, and files through the server.
- Admin configuration stores the selectable `所属项目` list and per-ticket-type delivery/risk hours in MySQL.
- Authentication and operational directory data come from soyoo in real time; companyPlan no longer runs a full user/project directory sync.

## Source Package Contents

The handoff source package includes both frontend and backend code:

- Frontend: `apps/web/`.
- Backend entry: `apps/server/index.mjs`.
- Backend layers: `apps/server/config/`, `apps/server/db/`, `apps/server/service/`, `apps/server/controller/`, `apps/server/router/`, `apps/server/middleware/`, `apps/server/core/`.
- soyoo integration: `apps/server/ops/`.
- Seed data: `apps/server/seed-data.mjs`.
- SQLite-to-MySQL migration: `apps/server/scripts/migrate-sqlite-to-mysql.mjs`.
- Documentation: `README.md`, `docs/deployment.md`, `docs/demand-ticket-readiness.md`, `docs/handoff.md`, `docs/ops-field-mapping.md`.
- Codex skill: `.skills/company-plan/`.
- Workspace manifests: `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`.

The source package intentionally does not include generated dependencies, build output, or runtime data:

```text
node_modules/
dist/
.git/
data/
uploads/
.env
production secrets
```

After unpacking the source package, install and run with:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

## Current Rules

- Admin can see global navigation, all rows, and admin panels.
- Non-admin users stay inside `需求提单` and only see their relevant rows.
- Except admins, users see only tickets they requested or tickets assigned to them; users with the same responsibility type cannot see each other's unrelated tickets.
- All users see bottom tabs for `需求提单` and `延期任务预警`.
- Only admin and programmer roles see `任务甘特图`.
- Priorities are `紧急`, `优先`, `普通`, and `低优先`.
- In new-demand creation with Ops sync enabled, `所属项目` is selected from `/ops/tenants` and `项目名称` is selected from the user's visible `/ops/projects`. In seeded local mode, `项目名称` remains a free text input for deterministic scenario tests.
- Ticket age, status stay, remaining delivery time, warnings, and type defaults are calculated in hours.
- Only admin can drag gantt timeline bars and resize their visual length.
- Programmer can view scoped gantt rows but cannot drag them.
- Dragging/resizing a gantt bar only changes that bar's visual timeline state. It does not change row order, `开始日期`, warning data, or other ticket content.
- Removed features should stay removed unless explicitly requested: `排班表`, `负责人看板`, `字段管理`, `筛选`, `排序`, `分组`, `公告`, `行高`, `导出`.

## Run

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

The production server listens on `PORT` or `4174` by default. Seed users use `COMPANYPLAN_SEED_PASSWORD` or `CompanyPlan@2026` on a fresh database.

Default seed usernames:

```text
admin, producer, artist, ui, model, animator, dev, sound
```

Production login sends the submitted credentials directly to soyoo `POST /tools/login`; companyPlan never validates or stores that password. Invalid credentials stop immediately without running directory sync or user enrichment. A successful first login upserts the local `people` identity, maps soyoo administrators to `admin` and the `制片` tag to `producer`, then creates an HttpOnly-cookie session that includes both `username` and `roleKey`.

Attachments are stored under `COMPANYPLAN_UPLOAD_DIR` or `COMPANYPLAN_DATA_DIR/uploads`. Persistent application data is stored in MySQL:

```text
COMPANYPLAN_MYSQL_HOST=127.0.0.1
COMPANYPLAN_MYSQL_PORT=3306
COMPANYPLAN_MYSQL_USER=companyplan
COMPANYPLAN_MYSQL_PASSWORD=<password>
COMPANYPLAN_MYSQL_DATABASE=companyplan
COMPANYPLAN_OPS_ENABLED=1
COMPANYPLAN_OPS_BASE_URL=https://helperapi.soyootech.com
COMPANYPLAN_OPS_CACHE_TTL_MS=600000
```

Set `COMPANYPLAN_MYSQL_CREATE_DATABASE=1` only for local setup or tests when the configured MySQL user is allowed to create the schema database.

`COMPANYPLAN_OPS_BASE_URL` is used for soyoo authentication and integration calls. Production identity creation is login-driven; do not reintroduce the retired full-directory sync into the login critical path.

To migrate an existing legacy SQLite database into an empty MySQL database:

```bash
COMPANYPLAN_SQLITE_PATH=/srv/companyplan/data/companyplan.sqlite npm run migrate:sqlite:mysql
```

## Build

```bash
npm run build
```

## Scenario Test

```bash
npm run test:scenarios
```

The scenario test starts an isolated production server on `COMPANYPLAN_SCENARIO_PORT` or `4274`, uses a temporary upload directory and isolated MySQL database name, disables Ops sync for deterministic fixtures, and runs the demand-ticket permission, admin configuration, attachment open/download, button actionability, and gantt move/resize workflow checks in a real Chromium browser. Set `COMPANY_PLAN_URL` only when you intentionally want to test an existing server.

Demand-ticket delivery audit: [docs/demand-ticket-readiness.md](docs/demand-ticket-readiness.md).

Ops field mapping audit: [docs/ops-field-mapping.md](docs/ops-field-mapping.md).

Team handoff guide: [docs/handoff.md](docs/handoff.md).

## Deploy

Build the frontend and run the Node production server:

```bash
npm run build
npm run start
```

Set the `COMPANYPLAN_MYSQL_*` variables to a persistent MySQL database and set `COMPANYPLAN_DATA_DIR` or `COMPANYPLAN_UPLOAD_DIR` to a persistent uploads volume. Put the server behind HTTPS and set `COMPANYPLAN_COOKIE_SECURE=1` when TLS is terminated before the app.

More deployment notes: [docs/deployment.md](docs/deployment.md).

## Skill

The Codex skill for this project is stored in [skills/company-plan](skills/company-plan) and installed locally at `~/.codex/skills/company-plan`.

Before changing product behavior, read:

- [skills/company-plan/SKILL.md](skills/company-plan/SKILL.md)
- [skills/company-plan/references/product-spec.md](skills/company-plan/references/product-spec.md)
- [skills/company-plan/README.md](skills/company-plan/README.md)

## Architecture Notes

- `src/api/request.ts` is the only frontend module that calls `fetch`; views call `src/api/modules/companyPlan.ts`.
- `src/types/` owns shared TypeScript entities for people, projects, tickets, attachments, bootstrap data, and admin config.
- `src/layer/` owns reusable frontend utilities and global styles.
- `src/view/CompanyPlan/` owns the companyPlan page composition and page-private demo fallback data.
- `server/index.mjs` wires the app, static serving, middleware, service, controller, router, and PM2 entrypoint.
- `server/router/` only binds URLs to controller functions.
- `server/controller/` handles Express request/response details.
- `server/service/` handles business rules, permission-sensitive mutations, and audit orchestration.
- `server/dao/` contains transactional write/read helpers used by services.
- `server/db/company-plan-store.mjs` contains schema migration, seed materialization, scoped bootstrap reads, mapping helpers, attachment persistence, and audit storage.
