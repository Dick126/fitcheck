"""清理生产环境中的 smoke 测试账号（通过容器内 Python 执行）。"""
import io
import os
import sys

import paramiko

HOST = os.environ.get("FH", "82.156.164.242")
PASS = os.environ.get("FP", "")

CLEAN = (
    'import sqlite3\n'
    'con = sqlite3.connect("/data/fitcheck.db")\n'
    'rows = con.execute("select id from users where username like \'smoke_%\'").fetchall()\n'
    'ids = [r[0] for r in rows]\n'
    'if ids:\n'
    '    ph = ",".join("?" * len(ids))\n'
    '    for t in ("body_records", "plans", "checkins", "likes", "circle_members", "profiles"):\n'
    '        con.execute("delete from " + t + " where user_id in (" + ph + ")", ids)\n'
    '    con.execute("delete from circles where owner_id in (" + ph + ")", ids)\n'
    '    con.execute("delete from users where id in (" + ph + ")", ids)\n'
    'con.commit()\n'
    'print("removed", len(ids))\n'
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
    sftp.putfo(io.BytesIO(CLEAN.encode("utf-8")), "/tmp/cleanup_smoke.py")
    sftp.close()

    cmds = [
        "docker cp /tmp/cleanup_smoke.py fitcheck:/tmp/cleanup_smoke.py",
        "docker exec fitcheck python /tmp/cleanup_smoke.py",
        "docker exec fitcheck rm -f /tmp/cleanup_smoke.py",
        "rm -f /tmp/cleanup_smoke.py",
    ]
    for cmd in cmds:
        if user != "root":
            cmd = "echo '%s' | sudo -S bash -c %r" % (PASS, cmd)
        _, out, err = client.exec_command(cmd, timeout=120)
        text = (out.read().decode("utf-8", "replace") + err.read().decode("utf-8", "replace")).strip()
        if text:
            print(text)
    print("[cleanup done]")
    client.close()


if __name__ == "__main__":
    main()
