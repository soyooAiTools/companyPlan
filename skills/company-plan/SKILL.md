---
name: company-plan
description: Design, build, or refine the companyPlan playable-ad production SaaS prototype with WPS/KDocs-style demand-ticket tables, role-scoped permissions, project/person/task tracking, attachments, admin overview, and happy-path React/Vite implementation. Use when the user asks about companyPlan, 试玩广告项目管理, 需求提单, 金山表格复刻, SaaS 原型, 权限隔离, or continuing this repo.
---

# companyPlan

## Quick Start

Use this skill for companyPlan work: a lightweight SaaS prototype for a playable-ad studio that manages many concurrent projects, cross-discipline demand tickets, owner progress, attachments, and admin/global visibility.

For detailed product rules, read `references/product-spec.md` before changing behavior or UI.

## Workflow

1. Preserve the current product scope: happy-path frontend prototype first, no backend/database unless explicitly requested.
2. Keep the primary experience as a WPS/KDocs-like table document, not a generic dashboard or a full WPS clone.
3. Keep non-admin users restricted to the demand-ticket table and only their relevant rows.
4. Keep admin users able to reach global panels and work-sheet tabs.
5. Keep the `需求提单` page inside the right workspace with the left navigation visible; do not open it as a separate full-screen panel.
6. Validate changes with `npm run build` and, for UI changes, browser checks against admin and non-admin accounts.

## Product Guardrails

- Do not connect this project to Blueprint or Blueprint tooling.
- Do not reintroduce WPS controls the user rejected, especially `字段管理`, `筛选`, `排序`, `分组`, `公告`, `行高`, and `导出`.
- Do not show the document-style top title bar on the `需求提单` page.
- Do not add real database/auth flows while the request is still prototype/happy-path.
- Do not make a marketing landing page. The first screen should be the usable table experience.
- Keep demand tickets capable of representing images, attachments, and files.
- Keep `我的提单` visible so users can distinguish requests they created from tasks assigned to them.

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
- Admin can drag bars in `任务甘特图`; dragging only moves that ticket's visual timeline bar and must not change row order, start dates, or other ticket content.
- The same updated bar position must be visible in the relevant non-admin user's scoped gantt view.
- Programmer users can view their scoped `任务甘特图` but cannot drag timeline bars.
- `需求提单` does not show the document-style top title bar.
- Toolbar does not contain `字段管理`, `筛选`, `排序`, `分组`, `公告`, `行高`, or `导出`.
- Bottom sheet tabs stay pinned to the bottom of the page while the table body scrolls.
- Demand table includes project, content, `我的提单`, attachments, link, start date, priority, status, ticket age, status age, owner, type, and notes.
- Row selection still supports half-selected header state.
- `npm run build` passes.
