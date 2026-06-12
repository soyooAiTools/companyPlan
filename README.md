# companyPlan

Playable ad production SaaS prototype for demand-ticket, project, permission, warning, and gantt workflows.

Deployment branch:

```text
gh-pages
```

Repository:

```text
https://github.com/soyooAiTools/companyPlan
```

## Scope

- Frontend-only happy-path prototype.
- No backend, database, or real authentication yet.
- Account switching in the UI simulates role-scoped permissions.
- KDocs/WPS-like demand-ticket table, kept intentionally lightweight.
- Demand ticket creation supports images, attachments, and files.

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
npm run dev -- --port 5174
```

## Build

```bash
npm run build
```

## Deploy

Static files are published to the `gh-pages` branch.

```bash
npm run build
```

Then publish the contents of `dist/` to the `gh-pages` branch. Vite uses `/companyPlan/` as the production base path.

GitHub Pages is not live yet because GitHub returned:

```text
Your current plan does not support GitHub Pages for this repository.
```

To make it public on GitHub Pages, either make the repo public or use a GitHub plan that supports Pages for private repositories. The expected URL after Pages is enabled is:

```text
https://soyooaitools.github.io/companyPlan/
```

More deployment notes: [docs/deployment.md](docs/deployment.md).

## Skill

The Codex skill for this project is stored in [skills/company-plan](skills/company-plan) and installed locally at `~/.codex/skills/company-plan`.

Before changing product behavior, read:

- [skills/company-plan/SKILL.md](skills/company-plan/SKILL.md)
- [skills/company-plan/references/product-spec.md](skills/company-plan/references/product-spec.md)
- [skills/company-plan/README.md](skills/company-plan/README.md)
