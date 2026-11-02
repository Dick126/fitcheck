#!/usr/bin/env bash
# FitCheck 数据库备份：用容器内 Python 的 sqlite backup 保证一致性
set -e
BACKUP_DIR=/root/fitcheck-backups
mkdir -p "$BACKUP_DIR"
STAMP=$(date +%F-%H%M)
docker compose -f /root/fitcheck/deploy/docker-compose.yml exec -T fitcheck mkdir -p /data/backups
docker compose -f /root/fitcheck/deploy/docker-compose.yml exec -T fitcheck python -c "
import sqlite3, time
src = sqlite3.connect('/data/fitcheck.db')
dst = sqlite3.connect('/data/backups/fitcheck-$STAMP.db')
src.backup(dst)
dst.close(); src.close()
print('backup ok')
"
# 容器内备份落盘后挪到主机目录
docker compose -f /root/fitcheck/deploy/docker-compose.yml exec -T fitcheck sh -c 'ls /data/backups/*.db' | while read -r f; do
  [ -n "$f" ] || continue
  docker cp "fitcheck:$f" "$BACKUP_DIR/$(basename "$f")" 2>/dev/null || true
done
# 清理容器内旧备份并保留主机最近 14 份
docker compose -f /root/fitcheck/deploy/docker-compose.yml exec -T fitcheck sh -c 'ls -t /data/backups/*.db | tail -n +15 | xargs -r rm -f'
ls -t "$BACKUP_DIR"/*.db 2>/dev/null | tail -n +15 | xargs -r rm -f
echo "backup done -> $BACKUP_DIR"
