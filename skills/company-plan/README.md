# company-plan Skill Notes

This skill documents the companyPlan production SaaS rules for future Codex sessions.

## Files

- `SKILL.md`: short workflow, guardrails, and validation checklist.
- `references/product-spec.md`: product requirements and verification details.
- `agents/`: reserved for future role-specific helper notes.

## Current Product Shape

- Production SaaS for playable-ad demand tickets and project visibility.
- React/Vite frontend with a Node/Express API.
- SQLite persistence, HttpOnly cookie sessions, server-side role scoping, local attachment storage, and audit logs.
- Live URL: `https://playcools.top/companyPlan/`.
- Production process: PM2 service `companyplan`, proxied by Nginx.
- Runtime data path on the deployment server: `/srv/companyplan/data`.
- KDocs/WPS-like table experience, but intentionally lightweight.
- `需求提单` stays in the right workspace; it does not open as a separate full-screen panel.
- Demand toolbar shows only `添加记录` and `查找`.
- Bottom tabs are fixed at the page bottom.
- Admin can configure the selectable `表格项目名称` list and per-type default delivery/risk hours.
- Demand tickets use four priority labels: `紧急`, `优先`, `普通`, `低优先`.
- Demand-ticket age, status stay, remaining delivery time, warnings, and type defaults are calculated in hours.
- `排班表` and `负责人看板` are removed.

Do not return the app to a frontend-only/static-data implementation unless the user explicitly asks for a separate throwaway prototype.

## Permission Rules

- Admin can access global views and all rows.
- Non-admin users only navigate to `需求提单`.
- Project-owner sheets may render responsible/participating project tickets.
- Production-role sheets must render only tickets the user requested, tickets assigned to the user, or tickets matching the user's own discipline.
- All users can see `需求提单` and `延期任务预警`.
- Only admin and programmer roles can see `任务甘特图`.
- Only admin can drag gantt timeline bars and resize their visual length.
- Programmer can view scoped gantt rows, but gantt bars are read-only.
- Permissions must be enforced by the API, not only by frontend filtering.
- The UI must use login/session state; do not reintroduce account switching as an auth substitute.

## Runtime Rules

- Persist mutable data through the backend API.
- Store uploaded files under the configured upload directory and keep file metadata in SQLite.
- Attachment detail actions must support both browser open and download for stored files.
- Record meaningful ticket create/update and attachment events in audit logs.
- Admin configuration changes and gantt timeline updates should also be audited.
- Keep runtime data, SQLite files, uploads, cookies, and secrets out of git.
- For deployment changes, update `docs/deployment.md` and verify PM2/Nginx behavior.

## Gantt Rule

Admin gantt dragging updates only the selected ticket's visual timeline offset or visual length.

It must not change:

- row order
- `开始日期`
- warning data
- other ticket content
- other gantt bars

The same visual offset and length must appear in the corresponding programmer scoped gantt view.

## Validation

Run these before handing off:

```bash
npm run build
npm run test:scenarios
python /root/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/company-plan
python /root/.codex/skills/.system/skill-creator/scripts/quick_validate.py /root/.codex/skills/company-plan
```

For UI changes, also run browser checks across admin, programmer, and a non-programmer account. For deployment changes, verify the public `/companyPlan/` URL, unauthenticated API rejection, login, and `pm2 status companyplan`.

The scenario test currently covers admin project-name/type-hour configuration, Chinese priority labels, hour-based due calculation, scoped rows, button actionability, attachment open/download, read-only programmer gantt access, and admin gantt move/resize.
