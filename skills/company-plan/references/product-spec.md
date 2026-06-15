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

## Production Scope

- Use React/Vite patterns already in the repo for the frontend.
- Use the Node/Express API for all mutable data and bootstrap reads.
- Persist data in MySQL with configured production database credentials.
- Use real login sessions with HttpOnly cookies.
- Enforce permission scoping on the server for tickets, bootstrap data, attachments, and audit history.
- Store uploaded attachments on disk and metadata in MySQL.
- Store admin configuration for selectable `所属项目` names and per-ticket-type delivery/risk hours in MySQL.
- Keep runtime data, uploaded files, cookies, and passwords out of git.

Do not revert to frontend-only happy-path behavior, localStorage persistence, or account switching as a permission substitute unless the user explicitly asks for a separate prototype.

## Permissions

- Admin: can see all projects, all tickets, global overview, and admin panels.
- Non-admin: can only see the `需求提单` page.
- Non-admin visible rows must be relevant to that user.
- Except admins, rows must be limited to tickets the user requested or tickets assigned to the user. A model account must not see unrelated non-model tickets merely because they share a project, must not see another modeler's unrelated model tickets, and project-owner accounts must not see unrelated tickets merely because they own or participate in the project.
- Non-admin must not see admin navigation.
- Clicking `需求提单` should keep the left navigation shell in place and render the table in the right workspace, not open a separate full-screen panel.
- Inside the `需求提单` page, every account should see bottom sheet tabs for `需求提单` and `延期任务预警`.
- `延期任务预警` rows must provide `查看详情`; clicking it switches to the `需求提单` sheet and opens the corresponding ticket detail panel.
- Only admin and programmer accounts should see the `任务甘特图` bottom sheet tab.
- Every non-admin bottom sheet must render only that user's scoped/relevant tickets.
- Admin can drag `任务甘特图` timeline bars. Dragging updates only that ticket's shared visual timeline offset so the corresponding non-admin user's scoped gantt view reflects the same new position.
- Admin can resize a gantt bar's visual length. Resizing updates only that ticket's shared visual timeline length.
- Dragging or resizing a gantt bar must not change row order, `开始日期`, warning data, or any other ticket content.
- Programmer users can view their scoped gantt rows but cannot drag timeline bars.
- Other non-admin roles must not see the `任务甘特图` tab.
- API responses must not include out-of-scope ticket rows for non-admin users.
- API mutation handlers must reject out-of-scope ticket updates, attachment reads, and audit access.

## Authentication And Data

- Login should use username/password against seeded or persisted users.
- Sessions should be server-issued and stored in HttpOnly cookies.
- `/api/bootstrap` must reject unauthenticated requests.
- Ticket create/update flows must write to MySQL and remain visible after reload and process restart.
- Attachment upload must persist file content and metadata.
- Seeded/demo attachments must materialize real stored files, not metadata-only placeholders.
- Attachment detail actions should support opening and downloading stored files when file content exists.
- Audit events should capture ticket creation, ticket updates, attachment uploads, admin configuration changes, and gantt timeline updates with actor and timestamp.

## Admin Configuration

- Admin can configure the selectable `所属项目` list used by demand-ticket creation.
- The server must reject ticket creation when `所属项目` is not in the configured active list.
- New tickets must store the configured `所属项目` display name separately from the internal project-pool mapping (`projectId`) used for permissions.
- `项目名称` on the new-demand form is user-entered free text. It must not be populated from the admin `所属项目` list and must not display the internal project-pool mapping.
- Admin can configure default delivery hours and risk-warning hours for every ticket type/discipline, including `模型`.
- New tickets must use the server-side type configuration to calculate expected delivery hours, remaining hours, and risk state.
- Time calculations for ticket age, status stay, remaining delivery time, and warnings are hour-based, not day-based.
- Configuration changes must persist in MySQL and be returned through authenticated bootstrap data.

## Demand Ticket Table

Required columns:

- 所属项目
- 工作内容
- 我的提单
- 图片/附件/文件
- 超链接
- 开始日期
- 优先级
- 状态
- 提单时长
- 状态停留
- 剩余时间
- 负责人
- 任务类别
- 备注

Required priority labels:

- 紧急
- 优先
- 普通
- 低优先

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

Table cells should summarize counts compactly. Detail views should show filename, type, size, open action, and download action when file content is stored.

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

Use automated production scenario tests for backend behavior and browser checks when changing UI:

- Unauthenticated `/api/bootstrap` returns 401.
- Login succeeds for seeded role accounts.
- Ticket create/update, admin configuration, seeded attachment open, attachment upload/open/download, audit history, role scoping, button actionability, and gantt visibility are covered by `npm run test:scenarios`.
- Admin row count should be broader than non-admin.
- Non-admin top controls should not include admin/global navigation.
- Non-programmer non-admin bottom tabs should show only `需求提单` and `延期任务预警`.
- Programmer bottom tabs should include `任务甘特图`, but gantt bars remain read-only.
- Non-admin warning and gantt rows should be no broader than that user's scoped ticket set.
- Admin drag on a gantt bar changes only that bar's visible timeline position; resizing changes only that bar's visible timeline length; row order and `开始日期` stay unchanged, and the relevant non-admin account sees the same updated bar state in their scoped gantt view.
- Priority controls should expose only `紧急`, `优先`, `普通`, and `低优先`.
- The ticket form should show hour-based expected delivery, not `期望天数`.
- Warning rows should be based on remaining hours and configured per-type risk-warning hours.
- `字段管理`, `筛选`, `排序`, `分组`, `公告`, `行高`, and `导出` should not appear in the `需求提单` toolbar.
- The `需求提单` body should not show the document-style title bar, collaborator avatars, share button, or top account selector.
- Bottom worksheet tabs should sit at the viewport bottom.
- First viewport should be dominated by the table document, not cards.
