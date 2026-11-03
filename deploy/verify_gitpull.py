"""迁移后验证：站点健康、数据完好、git pull 可用。"""
import io
import os
import sys

import paramiko

HOST = os.environ.get("FH", "")
PASS = os.environ.get("FP", "")

CHECK = (
    "import sqlite3\n"
    "c = sqlite3.connect('/data/fitcheck.db')\n"
    "def n(sql):\n"
    "    return c.execute(sql).fetchone()[0]\n"
    "print('users:', n('select count(*) from users'))\n"
    "print('checkins:', n('select count(*) from checkins'))\n"
    "print('circles:', n('select count(*) from circles'))\n"
)


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    user = "root"
    try:
        client.connect(HOST, username="root", password=PASS, timeout=20)
    except Exception:
        client.connect(HOST, username="ubuntu", password=PASS, timeout=20)
        user = "ubuntu"

    sftp = client.open_sftp()
    sftp.putfo(io.BytesIO(CHECK.encode()), "/tmp/check_db.py")
    sftp.close()

    cmds = [
        "curl -s -m 10 http://127.0.0.1:8000/api/health",
        "docker cp /tmp/check_db.py fitcheck:/tmp/check_db.py",
        "docker exec fitcheck python /tmp/check_db.py",
        "docker exec fitcheck rm -f /tmp/check_db.py",
        "rm -f /tmp/check_db.py",
        "cd /root/fitcheck && git pull",
        "cd /root/fitcheck && git status -sb",
    ]
    for cmd in cmds:
        if user != "root":
            cmd = "echo '%s' | sudo -S bash -c %r" % (PASS, cmd)
        _, out, err = client.exec_command(cmd, timeout=180)
        text = (out.read().decode("utf-8", "replace") + err.read().decode("utf-8", "replace")).strip()
        print(text if text else "(无输出)")
    client.close()


if __name__ == "__main__":
    main()
