---
name: company-plan
description: Work on the companyPlan Ops/project-pool/product-management system and its soyoo integrations. Use when changing or investigating companyPlan, Ops 提单, Ops 项目池, 项目阶段, 下版交付时间, 超时关注, 飞书同步, soyoo helper-server/helper-admin interactions, role/tag sync, notifications, deployment, or repo cleanup/design planning.
---

# company-plan

## Start Here

Use this skill for the current companyPlan system, not the old standalone WPS-style prototype assumptions.

Before changing behavior, identify which side owns the data:

- `companyPlan/apps/server`: Ops backend, project pool, tickets, notifications, permissions, Prisma/MySQL.
- `companyPlan/apps/web`: Ops frontend.
- `soyoo-playable-helper-server`: soyoo source of truth for projects, project status, stage deadlines, Feishu integration helpers.
- `soyoo-playable-helper-admin`: soyoo management UI, including create/edit project deadline controls.

For the current design map and refactor plan, read `references/design.md`.

## Workflow

1. Inspect code before deciding. Prefer `rg` and small focused reads.
2. Preserve data ownership. Do not duplicate soyoo-owned project fields into Ops unless there is an explicit sync contract.
3. Keep Ops project-pool UI focused on operational scanning: dense table, filters, direct edit actions, project flow logs.
4. Keep long pages split by responsibility. For large views, extract pure utils, table cells/columns, modals/drawers, hooks, and API adapters.
5. Do not mix temporary scripts, generated reports, or local run outputs into commits unless the user asks.
6. When changing cross-system sync, document source, target, matching key, dry-run mode, write mode, and output report location.

## Current Domain Rules

- Project stage has a stable `key` and display `name`; display names and small labels must not be inferred from hard-coded UI-only text.
- Stage deadlines are a group of planned delivery dates. Each date means that stage result is delivered to the client.
- Ops project pool reads and edits the soyoo `stage_deadlines`; Ops does not own a separate stage deadline table.
- The project pool “下版交付时间” is calculated from current stage plus the next item in `stage_deadlines`.
- “超时关注” for project stage delivery follows overdue `下版交付时间`, not old Ops status/stage-stay setting thresholds.
- Editing “下版交付时间” should write a project flow log when actual dates change.
- Feishu project stage sync uses project name/record id matching and should report unmatched or empty-stage records to local markdown.
- Status sync from Feishu may need to update both soyoo and Ops snapshots when Feishu was manually changed.
- Role/tag sync comes from soyoo labels into Ops people/roles; Ops login and permissions still use Ops-side user data after sync.

## UI Rules

- Build actual operational screens, not landing pages.
- Keep project-pool table compact and scan-friendly.
- Avoid huge monolithic `ProjectPoolPage.tsx`; split into `view/ProjectPool` modules.
- Date/deadline editors should support auto-inference, manual override, and weekend skipping when requested.
- Use existing Ant Design and local components before inventing new UI primitives.
- Keep temporary console logs obvious and easy to remove.

## Validation

Use the smallest validation that covers the change:

- Server-only JS: `node --check <file>`.
- Web TypeScript: prefer the local workspace binary if pnpm tries to reinstall, e.g. `apps/web/node_modules/.bin/tsc -b --pretty false`.
- Full app build only when dependencies are installed and the user is ready for it: `npm run build`.
- For sync scripts: run dry-run/query mode before write mode and inspect generated markdown/SQL output.

## Guardrails

- Do not touch unrelated dirty files.
- Do not commit docs or generated reports unless explicitly requested.
- Do not reset or checkout user changes.
- Do not assume Feishu will remain the long-term source; the direction is to replace Feishu later.
- Do not reintroduce the old `companyPlan/skills` path; this repo uses `.skills`.
