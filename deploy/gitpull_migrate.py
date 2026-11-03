"""把服务器上的 /root/fitcheck 迁移为 GitHub 仓库克隆，启用 git pull 更新。"""
import os
import sys

import paramiko

HOST = os.environ.get("FH", "")
PASS = os.environ.get("FP", "")
CLONE = "https://github.com/Dick126/fitcheck.git"

CMDS = [
    ("检查 git", "git --version || (apt-get update -qq && apt-get install -y -qq git)"),
    ("备份 Key 配置", "cp -a /root/fitcheck/deploy/.env /tmp/fitcheck.env"),
    ("移走旧目录", "rm -rf /root/fitcheck.bak && mv /root/fitcheck /root/fitcheck.bak"),
    ("克隆仓库", f"git clone {CLONE} /root/fitcheck"),
    ("恢复 Key 配置", "cp /tmp/fitcheck.env /root/fitcheck/deploy/.env && chmod 600 /root/fitcheck/deploy/.env && rm -f /tmp/fitcheck.env"),
    ("确认版本", "cd /root/fitcheck && git log --oneline -3"),
    ("重建容器", "cd /root/fitcheck/deploy && docker compose up -d --build"),
    ("容器状态", "docker ps --format '{{.Names}} {{.Status}} {{.Ports}}'"),
    ("健康检查", "curl -s -m 5 http://127.0.0.1:8000/api/health"),
    ("数据量检查", "docker exec fitcheck python -c 'import sqlite3; c=sqlite3.connect(\"/data/fitcheck.db\"); print(\"users:\", c.execute(\"select count(*) from users\").fetchone()[0])'"),
]


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if not HOST or not PASS:
        raise SystemExit("请设置 FH / FP")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    user = "root"
    try:
        client.connect(HOST, username="root", password=PASS, timeout=20)
    except Exception:
        client.connect(HOST, username="ubuntu", password=PASS, timeout=20)
        user = "ubuntu"
    print(f"[ssh] 以 {user} 登录")

    for label, cmd in CMDS:
        if user != "root":
            cmd = "echo '%s' | sudo -S bash -c %r" % (PASS, cmd)
        _, out, err = client.exec_command(cmd, timeout=900)
        text = (out.read().decode("utf-8", "replace") + err.read().decode("utf-8", "replace")).strip()
        print(f"\n===== {label} =====")
        print(text[-1500:] if text else "(无输出)")
    client.close()
    print("\n[done]")


if __name__ == "__main__":
    main()
