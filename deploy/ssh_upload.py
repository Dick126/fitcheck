"""上传单个文件到云服务器指定路径（sudo 安装到目标）。"""
import os
import sys

import paramiko

HOST = os.environ.get("FH", "82.156.164.242")
PASS = os.environ.get("FP", "")
LOCAL = os.environ.get("FLOC", "")
REMOTE = os.environ.get("FREM", "")


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if not LOCAL or not REMOTE:
        raise SystemExit("请设置 FLOC 和 FREM")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    user = "root"
    try:
        client.connect(HOST, username="root", password=PASS, timeout=20)
    except Exception:
        client.connect(HOST, username="ubuntu", password=PASS, timeout=20)
        user = "ubuntu"

    sftp = client.open_sftp()
    sftp.put(LOCAL, "/tmp/upfile")
    sftp.close()

    if user == "root":
        cmd = f"install -m 644 /tmp/upfile {REMOTE} && rm -f /tmp/upfile && ls -l {REMOTE}"
    else:
        cmd = ("echo '%s' | sudo -S bash -c 'install -m 644 /tmp/upfile %s && "
               "rm -f /tmp/upfile && ls -l %s'") % (PASS, REMOTE, REMOTE)
    _, out, err = client.exec_command(cmd, timeout=60)
    print(out.read().decode("utf-8", "replace").strip())
    print(err.read().decode("utf-8", "replace").strip())
    print("[upload ok]", LOCAL, "->", REMOTE)
    client.close()


if __name__ == "__main__":
    main()
