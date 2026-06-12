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
- Non-admin must not see admin navigation.
- Clicking `需求提单` should keep the left navigation shell in place and render the table in the right workspace, not open a separate full-screen panel.
- Inside the `需求提单` page, every account should see bottom sheet tabs for `需求提单` and `延期任务预警`.
- Only admin and programmer accounts should see the `任务甘特图` bottom sheet tab.
- Every non-admin bottom sheet must render only that user's scoped/relevant tickets.
- Admin can drag `任务甘特图` timeline bars. Dragging updates only that ticket's shared visual timeline offset so the corresponding non-admin user's scoped gantt view reflects the same new position.
- Dragging a gantt bar must not change row order, `开始日期`, warning data, or any other ticket content.
- Programmer users can view their scoped gantt rows but cannot drag timeline bars.
- Other non-admin roles must not see the `任务甘特图` tab.

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

- No document-style top title bar on `需求提单`; the page should start with the compact table toolbar.
- Lightweight toolbar with only 添加记录 and 查找 visible on `需求提单`.
- Filter row and status summary chips.
- Spreadsheet gridlines.
- Sticky header and frozen first columns.
- Status group sections with colored pills and per-group add rows.
- Bottom statusbar and worksheet tabs.
- Worksheet tabs should stay pinned to the bottom of the page while the table body scrolls.

Avoid:

- 行高
- 导出
- Toolbar controls 字段管理、筛选、排序、分组、公告
- Document-style top title bar on `需求提单`
- 排班表 and 负责人看板 features
- Full WPS app complexity
- Marketing-style landing pages
- Blueprint references

## Verification

Use browser checks when changing UI:

- Admin row count should be broader than non-admin.
- Non-admin top controls should not include admin/global navigation.
- Non-programmer non-admin bottom tabs should show only `需求提单` and `延期任务预警`.
- Programmer bottom tabs should include `任务甘特图`, but gantt bars remain read-only.
- Non-admin warning and gantt rows should be no broader than that user's scoped ticket set.
- Admin drag on a gantt bar changes only that bar's visible timeline position; row order and `开始日期` stay unchanged, and the relevant non-admin account sees the same updated bar in their scoped gantt view.
- `字段管理`, `筛选`, `排序`, `分组`, `公告`, `行高`, and `导出` should not appear in the `需求提单` toolbar.
- The `需求提单` body should not show the document-style title bar, collaborator avatars, share button, or top account selector.
- Bottom worksheet tabs should sit at the viewport bottom.
- First viewport should be dominated by the table document, not cards.
