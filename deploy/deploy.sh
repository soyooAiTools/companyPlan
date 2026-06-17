#!/usr/bin/env bash
# companyPlan ops 后端一键部署:校验配置 → 装依赖 → 生成 Prisma 客户端 → 构建前端 → PM2 启动/热重载
# 用法(服务器上,先 git pull 拉最新代码):
#   npm run deploy        # 或 pnpm run deploy
set -euo pipefail

# 切到仓库根目录(本脚本位于 deploy/ 下)
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
echo "[deploy] 仓库根: $ROOT"

# 0) 生产配置校验:.env.prod 已 gitignore,不随 git 同步,必须在服务器上手动放到「仓库根目录」
if [ ! -f "$ROOT/.env.prod" ]; then
  echo "[deploy][ERROR] 缺少 $ROOT/.env.prod" >&2
  echo "                这是 MySQL/OSS/soyoo/CORS/cookie 等生产配置(gitignore,不进 git)。" >&2
  echo "                参考 deploy/env.prod.example 创建后再部署。" >&2
  exit 1
fi
# 关键项粗检(空密码是本次 'using password: NO' 的元凶)
if ! grep -q '^COMPANYPLAN_MYSQL_PASSWORD=..' "$ROOT/.env.prod"; then
  echo "[deploy][WARN] .env.prod 里 COMPANYPLAN_MYSQL_PASSWORD 看起来为空,MySQL 可能连不上。" >&2
fi

# 1) 依赖(--prod=false 确保装上 vite/tsc/prisma 等 devDeps,否则 build/generate 会失败)
echo "[deploy] pnpm install"
pnpm install --prod=false

# 2) Prisma 客户端(schema 有 segment_id / wechat 等新字段,不重生成会报 unknown field)
echo "[deploy] prisma generate"
( cd apps/server && npx --no-install prisma generate )

# 3) 构建前端(server 也会托管 dist;若前端纯走 OSS,可注释掉这步)
echo "[deploy] build web"
pnpm build

# 4) PM2 启动或热重载(--update-env 重新读取 env)
echo "[deploy] pm2 startOrReload"
pm2 startOrReload deploy/ecosystem.config.cjs --update-env
pm2 save

echo "[deploy] 完成 ✅  查看日志: pm2 logs companyplan-ops-api"
