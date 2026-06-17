const path = require("path");

// PM2 部署 —— companyPlan ops 后端(Node / Express,端口 4174)
//
// 业务配置(MySQL / OSS / soyoo 地址 / CORS 白名单 / cookie)统一放在 companyPlan/.env.prod,
// 由 apps/server/config/runtime.mjs 在 APP_ENV=prod 时自动加载;这里只负责把进程拉起来 + 常驻。
//
// 服务器上用法(在 companyPlan 仓库根目录):
//   pnpm install
//   (cd apps/server && npx --no-install prisma generate)   # 生成 Prisma 客户端(schema 有新字段)
//   pnpm build                                              # 如该机也出前端 dist(纯 OSS 部署可跳过)
//   pm2 start deploy/ecosystem.config.cjs
//   pm2 save && pm2 startup                                 # 开机自启
//   pm2 logs companyplan-ops-api                            # 看日志
module.exports = {
  apps: [
    {
      name: "companyplan-ops-api",
      // 后端目录(相对本文件:deploy/.. → companyPlan,再进 apps/server),换机器无需改
      cwd: path.join(__dirname, "..", "apps", "server"),
      script: "index.mjs",
      interpreter: "node",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      max_memory_restart: "500M",
      time: true,
      // 只设 APP_ENV → 触发加载 companyPlan/.env.prod;密钥不进 PM2,避免被 pm2 dump 暴露
      env: {
        APP_ENV: "prod",
      },
    },
  ],
};
