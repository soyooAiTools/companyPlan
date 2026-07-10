# companyPlan Skill And Design Plan

## Directory Standard

Use this repository-local skill path:

```text
companyPlan/.skills/
└── company-plan/
    ├── SKILL.md
    ├── agents/
    │   └── openai.yaml
    └── references/
        └── design.md
```

Do not use `companyPlan/skills`. A visible `skills` directory is easy to confuse with product code and does not match the repository convention requested for this project.

## Skill Scope

The skill is for future Codex sessions working on:

- Ops project pool and ticket system.
- soyoo project/status/stage deadline integration.
- Feishu one-off sync scripts and migration cleanup.
- Ops notification and overdue attention logic.
- Admin/helper-server create/edit project stage deadline controls.
- Refactors that keep these features understandable.

The skill should not try to be a full product specification dump. Keep `SKILL.md` short and route detailed design here.

## Source Of Truth

| Data | Source of truth | Ops behavior |
| --- | --- | --- |
| Project base info | soyoo helper-server projects | Read through integration APIs |
| Project status | soyoo; Ops keeps snapshots/logs where needed | Mutations should sync soyoo and Ops-visible state |
| Current production stage | Ops ext / sync result depending existing code path | Used for filtering and next-deadline calculation |
| Stage deadline group | soyoo `stage_deadlines` | Ops reads/edits through soyoo integration |
| Project flow logs | Ops MySQL | Write when Ops changes status, stage, remark, or deadline dates |
| Feishu project stage column | Temporary migration/sync input | Use scripts; report unmatched/empty rows |
| User roles/tags | soyoo labels synced into Ops users | Ops login and permission checks read Ops-side data |

## Project Pool Refactor Plan

Target structure:

```text
apps/web/src/view/ProjectPool/
├── ProjectPoolPage.tsx
├── deadlineUtils.ts
├── logUtils.ts
├── components/
│   ├── ProjectPoolToolbar.tsx
│   ├── ProjectPoolTable.tsx
│   ├── StageDeadlineCell.tsx
│   ├── StageDeadlineModal.tsx
│   ├── ChangeProjectFieldModal.tsx
│   ├── RemarkModal.tsx
│   ├── ProjectLogsDrawer.tsx
│   ├── MembersModal.tsx
│   └── SegmentTicketsModal.tsx
└── hooks/
    ├── useProjectPoolData.ts
    ├── useProjectPoolDialogs.ts
    └── useProjectPoolScroll.ts
```

Keep `apps/web/src/view/Ops/ProjectPoolPage.tsx` as a thin wrapper until routing is moved:

```ts
export { default } from "../ProjectPool/ProjectPoolPage";
```

Refactor order:

1. Move the page into `view/ProjectPool` and keep the wrapper.
2. Extract deadline/date pure utilities.
3. Extract log display helpers and `ProjectLogsDrawer`.
4. Extract `StageDeadlineCell` and `StageDeadlineModal`.
5. Extract simple modals: status/stage change, remark, members, segment tickets.
6. Extract table column builder or `ProjectPoolTable`.
7. Extract data loading into a hook only after UI components are stable.

Each step should compile before the next step.

## Backend Design Notes

Project-pool service responsibilities:

- Load soyoo project list.
- Load Ops ext fields.
- Merge data into rows for table display.
- Apply permissions.
- Write Ops logs for Ops-side visible changes.
- Ask soyoo to mutate soyoo-owned project fields.

Notification responsibilities:

- Project delivery overdue notifications should follow the computed next deadline from `stage_deadlines`.
- Old status/stage-stay thresholds can remain hidden/disabled unless requested again.
- Do not mix ticket overdue logic with project delivery overdue logic.

Sync script responsibilities:

- Always support query/dry-run before write.
- Write local markdown reports under the script directory `out/`.
- Include record id, project name, old DB value, new Feishu value, and reason for skipped rows.
- Skip no-op updates when source and target values are already equal.

## UI Design Notes

Project pool should optimize for repeated manager use:

- Dense table with clear status/date indicators.
- Filters for status and production stage.
- “下版交付时间” column shows `(MM-DD)阶段名` and remaining/overdue days.
- Hover card shows the full stage deadline group with current and next highlighted.
- Deadline edit modal supports auto-inference from `【资产确认】`, editable interval days, weekend skip, and manual date override.
- Logs drawer includes status, stage, delivery, and remark categories.

Avoid:

- Large explanatory blocks inside the working UI.
- Nested cards.
- Recreating a date picker when Ant Design already provides one.
- Duplicating soyoo-owned data into Ops solely for display.

## Validation Matrix

| Change type | Minimum validation |
| --- | --- |
| Pure frontend refactor | `apps/web/node_modules/.bin/tsc -b --pretty false` |
| Server JS change | `node --check <changed .mjs>` |
| Project deadline behavior | Edit a project date, confirm soyoo data updates, Ops table refreshes, and flow log appears |
| Overdue attention behavior | Confirm overdue tab/list uses next deadline, not old stage-stay settings |
| Feishu sync script | Run query mode, inspect markdown output, then run write mode only with user confirmation |
| Deployment | Generate Prisma client if needed, start prod API, verify relevant endpoints |

## Commit Hygiene

- Stage only files related to the user’s current request.
- Keep generated markdown reports and docs out of commits unless requested.
- Mention validation commands in the final response.
