---
name: company-plan
description: Design, build, deploy, or refine the companyPlan playable-ad production SaaS with WPS/KDocs-style demand-ticket tables, Node/MySQL persistence, real login sessions, role-scoped permissions, project/person/task tracking, attachments, audit logs, admin overview, PM2/Nginx deployment, and production validation. Use when the user asks about companyPlan, 试玩广告项目管理, 需求提单, 金山表格复刻, SaaS, 权限隔离, 部署, or continuing this repo.
---

# companyPlan

## Quick Start

Use this skill for companyPlan work: a production SaaS for a playable-ad studio that manages many concurrent projects, cross-discipline demand tickets, owner progress, attachments, audit history, and admin/global visibility.

The current app is a React/Vite frontend backed by a Node/Express API, MySQL persistence, HttpOnly cookie sessions, local attachment storage, and server-side permission checks. Do not treat it as a frontend-only prototype unless the user explicitly asks to create a separate prototype.

For detailed product rules, read `references/product-spec.md` before changing behavior or UI.

For repo setup and deployment notes, read `README.md` in this skill folder and the repository `docs/deployment.md`.

For Ops data-source or field-semantics work, also read the repository `docs/ops-field-mapping.md`.

## Workflow

1. Preserve the current production scope: backend-backed data system first, with persistent tickets, attachments, sessions, audit logs, and role-scoped API responses.
2. Keep the primary experience as a WPS/KDocs-like table document, not a generic dashboard or a full WPS clone.
3. Keep authentication real: users log in through the API, sessions use HttpOnly cookies, and the UI must not expose a role/account switcher as a permission substitute.
4. Keep non-admin users restricted to the demand-ticket table and only their server-scoped relevant rows.
5. Keep admin users able to reach global panels and work-sheet tabs.
6. Keep the `需求提单` page inside the right workspace with the left navigation visible; do not open it as a separate full-screen panel.
7. Validate changes with `npm run build` and `npm run test:scenarios`; for UI changes, add browser checks against admin, programmer, and a non-programmer account.

## Product Guardrails

- Do not connect this project to Blueprint or Blueprint tooling.
- Do not reintroduce WPS controls the user rejected, especially `字段管理`, `筛选`, `排序`, `分组`, `公告`, `行高`, and `导出`.
- Do not show the document-style top title bar on the `需求提单` page.
- Do not bypass the backend with localStorage writes, static in-memory seed edits, or client-only permission filtering.
- Do not commit runtime data, MySQL dumps, uploaded attachments, PM2 dumps, cookies, or passwords.
- Do not make a marketing landing page. The first screen should be the usable table experience.
- Keep demand tickets capable of representing images, attachments, and files.
- Keep `我的提单` visible so users can distinguish requests they created from tasks assigned to them.
- Keep server-side authorization mandatory for every ticket, audit, attachment, and bootstrap API.

## UI Direction

- Prefer dense spreadsheet-like bands, gridlines, sticky headers, grouped status rows, compact chips, and bottom worksheet tabs.
- The table should feel like a lightweight KDocs/WPS cloud table: compact toolbar, filters, status groups, grid body, statusbar, and sheet tabs.
- Use simple icon buttons for document/navigation controls and avoid decorative cards inside the table surface.

## Validation Checklist

Before handing off:

- Admin sees global data, admin navigation, and the add-sheet control.
- Non-admin stays inside the `需求提单` main page, sees only relevant rows, and has no admin navigation.
- All users can see bottom sheet tabs for `需求提单` and `延期任务预警`.
- Only admins and programmers can see the `任务甘特图` bottom sheet tab.
- Non-admin `需求提单`, `延期任务预警`, and any visible `任务甘特图` must all be backed only by that user's scoped/relevant tickets.
- Do not reintroduce the removed `排班表` or `负责人看板` features unless explicitly requested.
- Admin can drag bars in `任务甘特图`; moving or resizing affects only that ticket's visual timeline bar and must not change row order, start dates, or other ticket content.
- Admin can also resize the selected gantt bar's visual length without changing row order, start dates, warning data, or other ticket content.
- The same updated bar position and length must be visible in the relevant non-admin user's scoped gantt view.
- Programmer users can view their scoped `任务甘特图` but cannot drag timeline bars.
- `需求提单` does not show the document-style top title bar.
- Toolbar does not contain `字段管理`, `筛选`, `排序`, `分组`, `公告`, `行高`, or `导出`.
- Bottom sheet tabs stay pinned to the bottom of the page while the table body scrolls.
- Demand table includes project, content, `我的提单`, attachments, link, start date, priority, status, ticket age in hours, status age in hours, remaining time in hours, owner, type, and notes.
- With Ops sync enabled, `所属项目` is sourced from `/ops/tenants` and new-demand `项目名称` is sourced from visible `/ops/projects`; seeded local mode keeps admin-configured `所属项目` and user-entered `项目名称`.
- Priorities are `紧急`, `优先`, `普通`, and `低优先`.
- Stored attachments can be opened and downloaded from the ticket detail panel.
- Row selection still supports half-selected header state.
- `npm run build` passes.
- `npm run test:scenarios` passes.
- Unauthenticated `/api/bootstrap` returns 401.
- Login, ticket creation/update, admin configuration, attachment upload/open/download, audit history, role scoping, button actionability, and gantt visibility/move/resize are covered by scenario tests.
- If deployment was requested, the PM2 process is online and the public `/companyPlan/` URL plus proxied API endpoints respond correctly.
