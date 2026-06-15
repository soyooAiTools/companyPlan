# companyPlan 交接文档

日期：2026-06-15

## 项目概览

companyPlan 是试玩广告制作团队的需求提单和项目协作 SaaS。当前版本不是静态原型，而是 React/Vite 前端 + Node/Express API + MySQL 持久化的生产服务。

线上地址：

```text
https://playcools.top/companyPlan/
```

Git 仓库：

```text
https://github.com/soyooAiTools/companyPlan
```

当前线上进程：

```text
PM2 process: companyplan
Port: 4174
Production data: /srv/companyplan/data
Database: MySQL database `companyplan`
MySQL runtime: Podman container `companyplan-mysql`, data at `/srv/companyplan/mysql`, bound to `127.0.0.1:3306`
Uploads: /srv/companyplan/data/uploads
PM2 entry: `/srv/companyplan/start-companyplan.sh` sources `/srv/companyplan/companyplan.env`
```

## 当前版本重点

- 登录是真实服务端登录，使用 HttpOnly session cookie。
- `/api/bootstrap` 只返回当前用户可见数据。
- 非管理员只允许进入 `需求提单`，只能看到本人发起或指派给本人的提单。
- 管理员可见全局导航、全部提单、管理员配置、审计日志和甘特编辑能力。
- 附件真实落盘，详情里可打开和下载。
- 管理员配置、建单、状态变更、附件上传、甘特移动/调整长度都会写审计日志。
- `npm run test:scenarios` 覆盖登录、权限、建单、附件、管理员配置、预警、甘特、按钮可操作性等主流程。

## 字段语义

这一点务必保持一致，之前主要问题就出在字段串线：

| 用户可见字段 | 数据来源 | 数据库存储 | 说明 |
| --- | --- | --- | --- |
| 所属项目 | Ops 模式来自 `/ops/tenants`；seed 模式来自管理员页 `所属项目列表` | `tickets.source_project_name` | 新建需求时是下拉框，服务端会校验必须在当前启用列表里 |
| 项目名称 | Ops 模式来自当前用户可见 `/ops/projects`；seed 模式用户自己填写 | `tickets.project_name` | Ops 模式是项目下拉；seed 模式是文本输入框 |
| 内部项目映射 | Ops 模式来自所选 `/ops/projects[].id`；seed 模式来自服务端权限映射 | `tickets.project_id` | 用于权限和 scoped rows，不显示旧 `项目池` 字段 |

前端展示规则：

- 需求表第一列主文本显示 `所属项目`。
- 第一列副文本显示 `项目名称`；Ops 模式为所选 `/ops/projects[].name`，seed 模式为用户填写文本。
- 新建需求表单不能出现 `项目池` 字段。
- 新建需求表单不能出现旧字段名 `表格项目名称`。

## 目录结构

```text
README.md                         项目说明
docs/deployment.md                部署和运维说明
docs/demand-ticket-readiness.md   生产交付审计
docs/handoff.md                   本交接文档
server/index.mjs                  Express 入口、依赖装配、静态资源和 PM2 入口
server/config/                    运行环境、端口、数据目录和常量
server/db/                        MySQL 连接池、schema、迁移、种子、scoped reads、映射、附件、审计
server/dao/                       服务层使用的 SQL 读写和事务 helper
server/service/                   业务规则、权限敏感变更、审计编排
server/controller/                Express request/response 适配
server/router/                    API URL 注册
server/middleware/                session/auth、安全响应头和写请求 origin 校验
server/core/                      日志等基础能力
server/seed-data.mjs              种子用户、项目、提单、配置
src/App.tsx                       React 根挂载壳
src/api/                          前端请求层，只有 request.ts 直接调用 fetch
src/types/                        全局 TypeScript 类型
src/layer/                        通用样式和工具
src/view/CompanyPlan/             companyPlan 页面组合和页面私有 fallback 数据
scripts/company-plan-scenarios.mjs 端到端生产场景测试
scripts/migrate-sqlite-to-mysql.mjs 旧 SQLite 数据一次性迁移到 MySQL
skills/company-plan/              仓库内 Codex skill
```

本机已安装的 Codex skill 路径：

```text
/root/.codex/skills/company-plan
```

修改产品行为前应先读：

```text
skills/company-plan/SKILL.md
skills/company-plan/references/product-spec.md
skills/company-plan/README.md
docs/deployment.md
```

## 本地启动

安装依赖：

```bash
npm install
```

构建：

```bash
npm run build
```

启动生产服务：

```bash
npm run start
```

默认端口：

```text
4174
```

本地首次空数据库会使用种子账号。默认种子用户名：

```text
admin, producer, artist, ui, model, animator, dev, sound
```

默认本地种子密码来自：

```text
COMPANYPLAN_SEED_PASSWORD
```

如果没有设置，开发环境默认值在 `server/seed-data.mjs`。生产环境不要使用默认密码。

## 生产环境变量

生产 PM2 进程通过 `/srv/companyplan/start-companyplan.sh` 读取 `/srv/companyplan/companyplan.env`。该 env 文件权限应为 `0600`，需要这些关键环境变量：

```text
PORT=4174
COMPANYPLAN_DATA_DIR=/srv/companyplan/data
COMPANYPLAN_UPLOAD_DIR=/srv/companyplan/data/uploads
COMPANYPLAN_MYSQL_HOST=127.0.0.1
COMPANYPLAN_MYSQL_PORT=3306
COMPANYPLAN_MYSQL_USER=companyplan
COMPANYPLAN_MYSQL_PASSWORD=<生产 MySQL 密码>
COMPANYPLAN_MYSQL_DATABASE=companyplan
COMPANYPLAN_MYSQL_CONNECTION_LIMIT=10
COMPANYPLAN_COOKIE_SECURE=1
COMPANYPLAN_SESSION_DAYS=7
COMPANYPLAN_MAX_ATTACHMENT_BYTES=10485760
COMPANYPLAN_SEED_PASSWORD=<生产种子密码>
```

不要把生产密码、cookie、MySQL dump、uploads 打包进代码仓库或源码交接包。

生产 MySQL 容器使用 Podman 运行：

```text
name: companyplan-mysql
data: /srv/companyplan/mysql
bind: 127.0.0.1:3306
restart: always
systemd helper: podman-restart.service enabled
```

## 部署流程

部署前先备份：

```bash
backup_dir=/srv/companyplan/backups/$(date +%Y%m%d-%H%M%S)
mkdir -p "$backup_dir"
mysqldump -h "$COMPANYPLAN_MYSQL_HOST" -P "$COMPANYPLAN_MYSQL_PORT" -u "$COMPANYPLAN_MYSQL_USER" -p "$COMPANYPLAN_MYSQL_DATABASE" > "$backup_dir/companyplan.sql"
tar -C /srv/companyplan/data -czf "$backup_dir/uploads.tar.gz" uploads
```

构建并重启：

```bash
npm run build
COMPANYPLAN_SQLITE_PATH=/srv/companyplan/data/companyplan.sqlite npm run migrate:sqlite:mysql  # 仅旧 SQLite 首次迁移时执行
pm2 restart companyplan
```

检查：

```bash
pm2 status companyplan
curl -sS http://127.0.0.1:4174/api/health
curl -sS -i https://playcools.top/api/bootstrap
curl -sS https://playcools.top/companyPlan/ | rg -o 'assets/index-[^" ]+'
```

未登录 `/api/bootstrap` 应返回 `401`。

## 验证命令

每次改代码后至少跑：

```bash
npm run build
npm run test:scenarios
git diff --check
```

改 skill 后还要跑：

```bash
python /root/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/company-plan
python /root/.codex/skills/.system/skill-creator/scripts/quick_validate.py /root/.codex/skills/company-plan
```

UI 字段变更后建议用浏览器再确认：

- 非管理员登录后只能看到 `需求提单`。
- 新建需求里 `所属项目` 是 select。
- Ops 模式新建需求里 `项目名称` 是 project select；seed 模式仍是 input。
- 新建需求里没有 `项目池`、没有 `表格项目名称`。

## 数据库迁移

schema 在 `server/db/company-plan-store.mjs` 里由 `initializeSchema()` 和 `migrateSchema()` 管理。服务启动时自动迁移。

当前重要 ticket 字段：

```text
source_project_name VARCHAR(160)  -- 所属项目；Ops 模式来自 /ops/tenants
project_name VARCHAR(160)         -- 项目名称；Ops 模式来自 /ops/projects，seed 模式用户手填
project_id VARCHAR(64)            -- 内部权限项目映射；Ops 模式为 ops-project-{id}
```

生产库迁移后可这样检查：

```bash
mysql -h "$COMPANYPLAN_MYSQL_HOST" -P "$COMPANYPLAN_MYSQL_PORT" -u "$COMPANYPLAN_MYSQL_USER" -p "$COMPANYPLAN_MYSQL_DATABASE" -e "SHOW COLUMNS FROM tickets;"
mysql -h "$COMPANYPLAN_MYSQL_HOST" -P "$COMPANYPLAN_MYSQL_PORT" -u "$COMPANYPLAN_MYSQL_USER" -p "$COMPANYPLAN_MYSQL_DATABASE" -e "SELECT COUNT(*) AS missing_project_name FROM tickets WHERE project_name IS NULL OR trim(project_name) = '';"
```

期望：

```text
missing project_name = 0
```

## 权限规则

- Admin：可见全部项目、全部人员、全部提单、管理员配置和审计。
- Producer/UI/Model/Artist/Animator 等非管理员：只进入 `需求提单`，只看本人发起或指派给本人的提单。
- Programmer：可见 scoped `任务甘特图`，但甘特条只读。
- 只有 Admin 能拖动或调整甘特条。
- 权限必须在 API 层执行，不能只靠前端过滤。

## 甘特规则

管理员拖动或调整甘特条时，只能改：

```text
timeline_offset_hours
timeline_span_hours
```

不能改变：

```text
row order
start_at
warning data
ticket content
other bars
```

程序员视图应同步看到管理员调整后的同一条甘特状态。

## 禁止回退的内容

不要重新引入：

```text
字段管理
筛选
排序
分组
公告
行高
导出
排班表
负责人看板
顶部账号切换器
文档式顶栏
```

不要把项目改回前端-only 或 localStorage 存储。

## 最近一次交接前验证

最近一次交接前已完成：

```text
Branch: main
Remote: origin/main
npm run build: passed
npm run test:scenarios: passed, 349 assertions
node --check server modules: passed
quick_validate.py skills/company-plan: passed
quick_validate.py /root/.codex/skills/company-plan: passed
Production PM2 companyplan: online
Public URL: https://playcools.top/companyPlan/
```

最近一次生产备份：

```text
/srv/companyplan/backups/20260614-183233
```

源码交接包不会包含该生产备份。同事如需真实生产数据，需要单独按公司数据权限流程交接。

## 同事接手建议

1. 先读 `README.md`、`docs/deployment.md`、本文件和 `skills/company-plan/references/product-spec.md`。
2. 本地跑 `npm install`、`npm run build`、`npm run test:scenarios`。
3. 熟悉 `server/index.mjs` 的装配方式，再看 `server/router/`、`server/controller/`、`server/service/`、`server/dao/`、`server/db/company-plan-store.mjs`。
4. 熟悉 `src/view/CompanyPlan/index.tsx` 的主页面、TicketForm、表格、详情、预警和甘特。
5. 每次改字段或权限，必须补场景测试。
6. 每次部署前备份 MySQL database 和 `/srv/companyplan/data/uploads`。
