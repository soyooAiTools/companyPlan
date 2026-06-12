# companyPlan

Playable ad production SaaS for demand-ticket, project, permission, warning, attachment, audit, and gantt workflows.

Repository:

```text
https://github.com/soyooAiTools/companyPlan
```

## Scope

- Production data system with a Node API, SQLite database, HttpOnly session cookies, server-side row permissions, local attachment storage, and audit logging.
- The frontend never decides row-level permissions by itself. `/api/bootstrap` returns only data scoped to the logged-in account.
- KDocs/WPS-like demand-ticket table, kept intentionally lightweight.
- Demand ticket creation stores images, attachments, and files through the server.

## Current Rules

- Admin can see global navigation, all rows, and admin panels.
- Non-admin users stay inside `需求提单` and only see their relevant rows.
- All users see bottom tabs for `需求提单` and `延期任务预警`.
- Only admin and programmer roles see `任务甘特图`.
- Only admin can drag gantt timeline bars.
- Programmer can view scoped gantt rows but cannot drag them.
- Dragging a gantt bar only moves that bar's visual timeline position. It does not change row order, `开始日期`, warning data, or other ticket content.
- Removed features should stay removed unless explicitly requested: `排班表`, `负责人看板`, `字段管理`, `筛选`, `排序`, `分组`, `公告`, `行高`, `导出`.

## Run

```bash
npm install
npm run build
npm run start
```

The production server listens on `PORT` or `4174` by default. Seed users use `COMPANYPLAN_SEED_PASSWORD` or `CompanyPlan@2026` on a fresh database.

Default seed usernames:

```text
admin, producer, artist, ui, model, animator, dev, sound
```

Data is stored under `COMPANYPLAN_DATA_DIR` or `./data`:

```text
companyplan.sqlite
uploads/
```

## Build

```bash
npm run build
```

## Scenario Test

```bash
npm run test:scenarios
```

The scenario test starts an isolated production server on `COMPANYPLAN_SCENARIO_PORT` or `4274`, uses a temporary SQLite data directory, and runs the demand-ticket permission and workflow checks in a real Chromium browser. Set `COMPANY_PLAN_URL` only when you intentionally want to test an existing server.

Demand-ticket delivery audit: [docs/demand-ticket-readiness.md](docs/demand-ticket-readiness.md).

## Deploy

Build the frontend and run the Node production server:

```bash
npm run build
npm run start
```

Set `COMPANYPLAN_DATA_DIR` to a persistent volume and back it up. Put the server behind HTTPS and set `COMPANYPLAN_COOKIE_SECURE=1` when TLS is terminated before the app.

More deployment notes: [docs/deployment.md](docs/deployment.md).

## Skill

The Codex skill for this project is stored in [skills/company-plan](skills/company-plan) and installed locally at `~/.codex/skills/company-plan`.

Before changing product behavior, read:

- [skills/company-plan/SKILL.md](skills/company-plan/SKILL.md)
- [skills/company-plan/references/product-spec.md](skills/company-plan/references/product-spec.md)
- [skills/company-plan/README.md](skills/company-plan/README.md)
