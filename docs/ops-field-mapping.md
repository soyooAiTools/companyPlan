# Ops 接口字段对应关系

本文档说明 `/nickTemp/ops-api.md` 中的字段如何接入到当前 companyPlan 数据模型，供审核对照。

## 当前实时接口范围

companyPlan 已停用用户/项目全量同步。认证和业务选择分别按需调用以下 soyoo 接口：

| Ops 接口 | 在 companyPlan 中的用途 |
|---|---|
| `POST /tools/login` | 校验真实账号密码；失败直接返回，成功后才建本地身份和会话。 |
| `GET /integration/users/:id` | 登录成功但认证响应缺少 tags 时补查角色；也用于实时用户信息。 |
| `GET /integration/users/:id/projects` | 当前用户参与项目。 |
| `GET /integration/projects` | 项目池和管理员选项。 |
| `GET /integration/projects/:id/members` | 项目成员关系和标签。 |
| `GET /integration/tenants`、`GET /integration/tags` | 客户与标签选项。 |
| `GET /integration/changes` | 消费 soyoo outbox 变化，刷新已有工单快照。 |

## 用户字段映射

Ops 用户会写入 `people` 表，并通过 `/api/bootstrap` 返回给前端 `Person`。

| Ops 字段 | companyPlan 字段 | 当前规则 |
|---|---|---|
| `/ops/users[].id` | `people.id`、`Person.id` | 加前缀保存为 `ops-user-{id}`。 |
| `/tools/login.user.username` / 登录输入 | `people.username`、会话 `currentUser.username` | soyoo 认证成功后首次登录即 upsert；密码不落库、不写日志。 |
| `/ops/users[].nickname` | `people.name`、`Person.name` | 直接作为显示姓名；为空时回退到 `username`。 |
| `/ops/users[].developer_type` | `people.role_key`、`people.discipline`、`people.title` | 如果存在，按开发身份处理：`roleKey=programmer`、`discipline=研发`，岗位标题默认 `{developer_type}开发`，如果 tags 更明确则用 tags。 |
| `/ops/users[].role` | 暂不直接使用 | 实测接口不稳定返回该字段。管理员权限当前由 `管理员` 标签或 `COMPANYPLAN_OPS_ADMIN_USERNAMES` 推断。 |
| `/ops/users[].phone` | 暂不暴露 | 当前 companyPlan 用户模型和 UI 没有手机号字段。 |
| `/ops/users/:id/projects.data.tags[].name` | `people.role_key`、`people.discipline`、`people.title` | 与项目成员接口中的 tags 合并后用于岗位/角色推断。 |
| `/ops/projects/:id/members.data.members[].tags[].name` | `people.role_key`、`people.discipline`、`people.title` | 与用户项目接口中的 tags 合并后用于岗位/角色推断。 |
| `/ops/users/:id/projects.data.projects[].project_id` | `people.projectIds`、`project_team` | 加前缀保存为 `ops-project-{project_id}`，作为用户参与项目关系。 |
| `/ops/users/:id/project-stats.data.total` | `people.capacity` | 估算负载：`45 + total * 6`，限制在 `35..98`。 |
| `/ops/users/:id/project-stats.data.by_status` | `people.completion` | 用 `已完成`、`已反馈` 项目数除以 total 估算完成度百分比。 |

登录会话角色投影：

| Ops 信号 | companyPlan 角色 |
|---|---|
| `is_admin=true`，或标签包含 `管理员` / `admin` | `roleKey=admin` |
| 标签包含精确值 `制片` | `roleKey=producer` |
| 其他情况 | `roleKey=member` |

## 项目字段映射

Ops 项目会写入 `projects` 表，并通过 `/api/bootstrap` 返回给前端 `Project`。

| Ops 字段 | companyPlan 字段 | 当前规则 |
|---|---|---|
| `/ops/projects[].id` | `projects.id`、`Project.id` | 加前缀保存为 `ops-project-{id}`。 |
| `/ops/projects[].name` | `projects.name`、`Project.name` | 直接使用；为空时回退为 `Ops 项目 {id}`。 |
| `/ops/projects[].tenant_id` | 内部查询键 | 用于关联 `/ops/tenants`，也用于识别该项目属于哪个 `所属项目`。 |
| `/ops/projects[].tenant_name` | `projects.client`、`Project.client` | 作为项目所属客户/所属项目名称；为空时回退到 `/ops/tenants[].name`，再为空显示 `-`。 |
| `/ops/projects[].planner_name` | `projects.owner_id`、`Project.ownerId` | 第一负责人候选；按导入用户的昵称或用户名匹配。 |
| `/ops/projects[].developer_name` | `projects.owner_id`、`Project.ownerId` | 第二负责人候选；当 planner 匹配不到人时使用。 |
| `/ops/projects[].status` | `projects.status`、`Project.status` | 直接保存，同时用于推导阶段、进度、健康度、交付天数。 |
| `/ops/projects/:id/members.data.members[].user_id` | `project_team.person_id`、`Project.teamIds` | 加前缀保存为 `ops-user-{user_id}`。 |
| `/ops/users/:id/projects.data.projects[].project_id` | `project_team.project_id`、`Person.projectIds` | 从用户侧补充项目参与关系。 |
| `/ops/projects/:id/members.data.by_tag` | 暂不暴露 | 当前 UI 通过导入人员和团队关系自行计算角色分布。 |
| `/ops/projects/:id/members.data.members[].remark` | 暂不暴露 | 当前 companyPlan 没有对应字段。 |
| `/ops/projects/:id/members.data.members[].assigned_at` | 暂不暴露 | 当前 companyPlan 没有对应字段。 |

项目负责人匹配回退顺序：

| 顺序 | 规则 |
|---|---|
| 1 | 用 `planner_name` 匹配导入用户的 `nickname` 或 `username`。 |
| 2 | 用 `developer_name` 匹配导入用户的 `nickname` 或 `username`。 |
| 3 | 使用团队中第一个被推断为 `producer` 的成员。 |
| 4 | 使用团队中第一个被推断为 `programmer` 的成员。 |
| 5 | 回退到本系统内置管理员 `u-admin`。 |

项目派生字段：

| companyPlan 字段 | 当前规则 |
|---|---|
| `genre` | 固定为 `试玩广告`。 |
| `channel` | 固定为 `Ops`。 |
| `phase` | 从 Ops `status` 推导：`未启动=排期`、`推进中=制作`、`待反馈=待反馈`、`已反馈=反馈处理`、`已完成=已完成`、`回收中=回收`、`客户暂停=暂停`；其他状态直接使用原状态。 |
| `health` | `已完成` / `已反馈` / `推进中` 为 `green`；`客户暂停` / `回收中` 为 `red`；其他为 `amber`。 |
| `progress` | `未启动=5`、`推进中=55`、`待反馈=78`、`已反馈=88`、`已完成=100`、`回收中=35`、`客户暂停=20`；其他状态为 `45`。 |
| `dueInDays` | `已完成=0`，`客户暂停=-1`，其他为 `7`。 |
| `ticketCount`、`openTicketCount` | 当前为 `0`；需求提单仍由 companyPlan 自己维护。 |
| `disciplineProgress` | 项目团队里出现的岗位使用项目进度；没有成员的岗位为 `0`。 |
| `blocker` | `客户暂停=客户暂停`，`回收中=项目回收中`，其他为 `无`。 |

## 所属项目字段映射

| Ops 字段 | companyPlan 字段 | 当前规则 |
|---|---|---|
| `/ops/tenants[].id` | `project_name_options.id`、`ProjectNameOption.id` | 加前缀保存为 `ops-tenant-{id}`。 |
| `/ops/tenants[].name` | `project_name_options.name`、`ProjectNameOption.name` | 作为新建提单 `所属项目` 下拉选项显示名。也作为 `/ops/projects[].tenant_name` 为空时的项目客户名回退值。 |
| `/ops/tenants[].description` | 暂不暴露 | 当前 companyPlan 没有对应字段。 |

## 标签字段映射

| Ops 字段 | companyPlan 字段 | 当前规则 |
|---|---|---|
| `/ops/tags[].id` | 暂不暴露 | 仅用于同步状态/审计计数。 |
| `/ops/tags[].name` | 不直接暴露 | 岗位推断使用用户项目明细、项目成员明细里的 tags。 |
| `/ops/tags[].color` | 暂不暴露 | 当前 companyPlan 角色标签颜色仍使用本地样式。 |

## `所属项目` 和 `项目名称` 选项映射

Ops tenants 会生成 `CompanyConfig.projectNameOptions`，用于新建提单里的 `所属项目` 下拉。

| 来源 | `ProjectNameOption` 字段 | 当前规则 |
|---|---|---|
| `/ops/tenants[].id` | `id` | `ops-tenant-{id}`。 |
| `/ops/tenants[].name` | `name` | 直接使用客户/所属项目名。如果重名，追加 `#{id}`。 |
| Ops 标记 | `source` | 固定为 `ops-tenant`。 |

前端提交行为：

| UI 字段 | 提交字段 | 当前规则 |
|---|---|---|
| `所属项目` 下拉 | `sourceProjectName` | 使用用户选择的 tenant 名称，即 `/ops/tenants[].name`。 |
| `项目名称` 下拉 | `projectName` | 使用用户选择的项目名称，即 `/ops/projects[].name`。 |
| `项目名称` 下拉 | `projectId` | 使用用户选择的 Ops 项目 ID，即 `ops-project-{id}`，作为内部权限/项目映射。 |

项目名称下拉过滤：

| 规则 | 说明 |
|---|---|
| Ops 模式 | `项目名称` 从当前用户可见的 `/ops/projects` 中选择。 |
| 选择 `所属项目` 后 | 优先展示 `Project.client` 等于所选 `所属项目` 的项目。 |
| 没有匹配项目时 | 回退展示当前用户可见的全部 Ops 项目。 |
| 本地/测试 seed 模式 | 为兼容现有场景测试，`项目名称` 仍是手填输入框。 |

服务端校验：

| 校验项 | 当前规则 |
|---|---|
| `projectId` 权限 | 非管理员只能在自己可见的 Ops 项目下创建提单，即本人是项目负责人或项目成员。 |
| `sourceProjectName` 合法性 | 必须存在于启用状态的 `project_name_options`。 |
| 负责人合法性 | `ownerId` 必须存在，且负责人的 `discipline` 必须等于提交的 `discipline`。 |

## 提单字段映射

Ops 当前不提供需求提单记录。现有 companyPlan 提单仍存储在 `tickets`、`attachments`、`audit_events` 中。

| companyPlan 提单字段 | 来源 |
|---|---|
| `sourceProjectName` / `tickets.source_project_name` | 新建提单时选择的 Ops tenant 名称，即 `所属项目`。 |
| `projectId` / `tickets.project_id` | 新建提单时选择的 Ops project ID，即 `ops-project-{id}`。 |
| `projectName` / `tickets.project_name` | 新建提单时选择的 Ops project 名称，即 `项目名称`。 |
| `requesterId` | 当前登录的 companyPlan 用户，包括导入的 Ops 用户 ID。 |
| `ownerId` | 用户选择的负责人，包括导入的 Ops 用户 ID。 |
| `discipline` | 用户选择的任务环节，且必须和负责人岗位一致。 |
| 附件、审计、状态、甘特 | 仍由 companyPlan 自己存储和鉴权。 |

## 反馈系统指派建单

试玩反馈后端使用服务签名调用 `/api/internal/playable-feedback`，浏览器不会直接持有共享密钥。

| 接口 | 用途 |
|---|---|
| `GET /projects/:id/responsibles?versionId=` | 按项目版本、OPS 环节标签返回可指派制作人员。 |
| `POST /tickets/batch` | 一次校验 1–20 位负责人，并为每人创建一张独立工单。 |
| `POST /tickets/status` | 按反馈系统的 assignment ID 批量读取工单状态。 |

来源映射保存在 `ops_ticket_source_links`。`(source_system, source_assignment_id)` 是唯一键，保证网络重试和重复点击不会重复建单；`payload_sha256` 用来拒绝“同一幂等键、不同负责人或内容”的错误重放。建单仍使用现有项目成员和环节标签校验，成功后沿用 companyPlan 的站内通知与 SSE 推送。

## 当前待审核缺口

| 缺口 | 当前处理方式 |
|---|---|
| 身份认证 | 已接入 soyoo `/tools/login`；错误账号密码不执行补查、建档或建会话。 |
| 手机号 | 暂不存储、不展示。 |
| 标签颜色 | 暂不展示；当前角色标签仍用本地样式。 |
| 项目成员 `remark`、`assigned_by`、`assigned_at` | 暂不存储、不展示。 |
| 客户列表独立页面 | 暂无；客户目前只作为项目客户名使用。 |
| Ops 项目交付日期 | Ops 接口没有交付日期字段；当前用项目状态推导占位值。 |
| Ops 项目提单数量 | Ops 接口没有需求提单数量；companyPlan 提单数量仍按本系统自己的提单数据计算。 |
