"""查看云服务器部署进度（独立于 remote_deploy.py 运行）。"""
import os
import sys

import paramiko

HOST = os.environ.get("FH", "")
PASS = os.environ.get("FP", "")


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    for user in ("root", "ubuntu"):
        try:
            client.connect(HOST, username=user, password=PASS, timeout=20)
            sudo = user != "root"
            break
        except Exception as exc:  # noqa: BLE001
            print(user, "login fail:", exc)
            sudo = True
    else:
        raise SystemExit("无法登录")

    def run(cmd, timeout=60):
        if sudo:
            cmd = "echo '%s' | sudo -S bash -c %r" % (PASS, cmd)
        _, out, err = client.exec_command(cmd, timeout=timeout)
        text = out.read().decode("utf-8", "replace") + err.read().decode("utf-8", "replace")
        return text.strip()

    print("== docker ==")
    print(run("docker ps 2>&1 | head -5") or "(无输出)")
    print("== 本机健康检查 ==")
    print(run("curl -s -m 5 http://127.0.0.1:8000/api/health 2>&1") or "(无输出)")
    print("== 目录 ==")
    print(run("ls /root/fitcheck 2>&1") or "(无输出)")
    print("== 最近构建日志 ==")
    print(run("cd /root/fitcheck/deploy && docker compose logs --tail 15 2>&1") or "(无输出)")
    client.close()


if __name__ == "__main__":
    main()
