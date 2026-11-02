"""在云服务器上执行一条命令并流式打印输出（sudo 由脚本处理）。"""
import os
import sys
import time

import paramiko

HOST = os.environ.get("FH", "82.156.164.242")
PASS = os.environ.get("FP", "")
CMD = os.environ.get("FCMD", "whoami")


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

    cmd = CMD
    if user != "root":
        cmd = "echo '%s' | sudo -S bash -c %r" % (PASS, CMD)
    print(f"$ {CMD}")
    _, out, err = client.exec_command(cmd, timeout=1800, get_pty=True)
    while True:
        if out.channel.recv_ready():
            chunk = out.channel.recv(65535).decode("utf-8", "replace")
            sys.stdout.write(chunk)
            sys.stdout.flush()
        if err.channel.recv_stderr_ready():
            chunk = err.channel.recv_stderr(65535).decode("utf-8", "replace")
            sys.stderr.write(chunk)
            sys.stderr.flush()
        if out.channel.exit_status_ready() and not out.channel.recv_ready() and not err.channel.recv_stderr_ready():
            break
        time.sleep(0.2)
    rc = out.channel.recv_exit_status()
    print(f"\n[exit {rc}]")
    client.close()


if __name__ == "__main__":
    main()
