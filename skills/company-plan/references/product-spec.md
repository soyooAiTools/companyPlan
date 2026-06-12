# companyPlan Product Spec

## Context

The company is a playable-ad production studio with about 100 people, about 150 projects per month, and around 15 contributors per project. Art, UI, model, animation, producer, development, and other roles work across many projects in parallel.

## Core Problems

- Too many projects to track manually.
- Managers cannot easily see an individual contributor's task status.
- Cross-discipline collaborators need clear demand tickets with visible age and status.
- Everyone needs online SaaS-style shared access.
- Users should only see projects and tickets relevant to their account.
- Admins need a global overview.

## Prototype Scope

- Frontend-only happy path.
- Use React/Vite patterns already in the repo.
- No backend, no database, no real authentication until explicitly requested.
- Account switching in the prototype stands in for permissions.

## Permissions

- Admin: can see all projects, all tickets, global overview, and admin panels.
- Non-admin: can only see the `需求提单` page.
- Non-admin visible rows must be relevant to that user: requester, owner, or project participation depending on role.
- Non-admin must not see admin sheet tabs or admin navigation.

## Demand Ticket Table

Required columns:

- 项目名称
- 工作内容
- 我的提单
- 图片/附件/文件
- 超链接
- 开始日期
- 优先级
- 状态
- 提单天数
- 状态停留
- 负责人
- 任务类别
- 备注

Required status handling:

- 排队中
- 进行中
- 阻塞
- 已完成

`我的提单` should distinguish "我提给别人", "指派给我", self-owned, and related tickets.

## Attachments

Demand ticket creation should support:

- 图片
- 附件
- 文件

Table cells should summarize counts compactly. Detail views can show filename, type, and size.

## KDocs/WPS Table Fidelity

Aim for a lightweight KDocs-like table form, not a full WPS clone.

Keep:

- Document-style top title bar.
- Collaborator avatars and share button.
- Lightweight toolbar with 添加记录, 字段管理, 筛选, 排序, 分组, 公告, 查找.
- Filter row and status summary chips.
- Spreadsheet gridlines.
- Sticky header and frozen first columns.
- Status group sections with colored pills and per-group add rows.
- Bottom statusbar and worksheet tabs.

Avoid:

- 行高
- 导出
- Full WPS app complexity
- Marketing-style landing pages
- Blueprint references

## Verification

Use browser checks when changing UI:

- Admin row count should be broader than non-admin.
- Non-admin top controls should not include admin/global navigation.
- Non-admin bottom tabs should show only `需求提单`.
- `行高` and `导出` should not appear in body text.
- First viewport should be dominated by the table document, not cards.
