#!/usr/bin/env bash
# FitCheck 云服务器一键部署：在服务器上以 root 运行本脚本即可。
# 用法：把整个 fitcheck 目录上传到服务器后，执行  bash deploy/setup.sh
set -e
cd "$(dirname "$0")/.."

# 1) 安装 Docker（已装则跳过）
if ! command -v docker >/dev/null 2>&1; then
  echo "==> 安装 Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi

# 2) 配置 DeepSeek Key（首次交互输入，写入 deploy/.env）
if [ ! -f deploy/.env ]; then
  read -rp "请输入 DeepSeek API Key（直接回车可跳过，之后编辑 deploy/.env 再重启即可）: " DSK
  printf 'DEEPSEEK_API_KEY=%s\n' "$DSK" > deploy/.env
  chmod 600 deploy/.env
fi

# 3) 构建并启动
echo "==> 构建并启动 FitCheck..."
docker compose -f deploy/docker-compose.yml up -d --build

# 4) 放行防火墙
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q active; then
  ufw allow 8000/tcp
fi

IP=$(curl -s --max-time 10 ifconfig.me || true)
echo ""
echo "✅ 部署完成！访问地址： http://${IP}:8000"
echo "   健康检查： http://${IP}:8000/api/health"
echo "   注意：请在云控制台的『防火墙/安全组』也放行 TCP 8000。"
echo "   查看日志： cd $(pwd)/deploy && docker compose logs -f"
echo "   每日备份：参考 deploy/README.md 第 7 节配置 crontab。"
