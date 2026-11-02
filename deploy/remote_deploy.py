"""FitCheck 远程部署：通过 SSH/SFTP 把项目上传到云服务器并一键启动。

用法（密码通过环境变量传入，不落盘）：
    set FP=你的密码
    python deploy/remote_deploy.py
"""
import os
import shlex
import sys
import time

import paramiko

HOST = os.environ.get("FH", "82.156.164.242")
PASS = os.environ.get("FP", "")
ZIP = os.path.join(os.path.dirname(__file__), "..", "fitcheck-upload.zip")
ZIP = os.path.abspath(ZIP)
ENV_FILE = os.path.join(os.path.dirname(__file__), "..", "server", ".env")

USERS = ["root", "ubuntu"]


def connect():
    last = None
    for user in USERS:
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        try:
            client.connect(HOST, username=user, password=PASS, timeout=20,
                           banner_timeout=20, auth_timeout=20)
            print(f"[ssh] 登录成功：{user}@{HOST}")
            return client, user
        except Exception as exc:  # noqa: BLE001
            last = exc
            print(f"[ssh] {user} 登录失败：{exc}")
    raise SystemExit(f"SSH 登录失败：{last}")


def run(client, cmd, sudo=False, timeout=1800, quiet=False):
    if sudo:
        cmd = f"echo {shlex.quote(PASS)} | sudo -S bash -c {shlex.quote(cmd)}"
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    rc = stdout.channel.recv_exit_status()
    if not quiet:
        if out.strip():
            print(out.strip()[-4000:])
        if err.strip():
            print("[stderr]", err.strip()[-2000:])
    return rc, out + err


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if not PASS:
        raise SystemExit("请先设置环境变量 FP 为服务器密码")
    if not os.path.exists(ZIP):
        raise SystemExit(f"找不到 {ZIP}，请先运行 deploy/pack.ps1")

    client, user = connect()
    sudo = user != "root"

    print("[1/6] 检查系统与权限…")
    run(client, "cat /etc/os-release | head -2; uname -m; df -h / | tail -1", sudo=False)

    print("[2/6] 上传项目压缩包…")
    sftp = client.open_sftp()
    sftp.put(ZIP, "/tmp/fitcheck-upload.zip")
    sftp.close()
    run(client, "ls -lh /tmp/fitcheck-upload.zip", sudo=True)

    print("[3/6] 解压到 /root/fitcheck …")
    run(client, "mkdir -p /root/fitcheck && rm -rf /root/fitcheck/* && "
                "unzip -o /tmp/fitcheck-upload.zip -d /root/fitcheck >/dev/null && "
                "ls /root/fitcheck", sudo=True)

    print("[4/6] 写入 DeepSeek Key 配置…")
    key_line = ""
    if os.path.exists(ENV_FILE):
        for line in open(ENV_FILE, encoding="utf-8"):
            if line.strip().startswith("DEEPSEEK_API_KEY"):
                key_line = line.strip()
                break
    if not key_line:
        raise SystemExit("本地 server/.env 里没有 DEEPSEEK_API_KEY")
    run(client, f"printf '%s\\n' {shlex.quote(key_line)} > /tmp/fitcheck.env && "
                "mkdir -p /root/fitcheck/deploy && "
                "install -m 600 /tmp/fitcheck.env /root/fitcheck/deploy/.env && "
                "rm -f /tmp/fitcheck.env && cat /root/fitcheck/deploy/.env", sudo=True)

    print("[5/6] 配置 Docker 镜像加速并启动（首次构建约 2–5 分钟）…")
    run(client, "mkdir -p /etc/docker && "
                "printf '{\"registry-mirrors\":[\"https://mirror.ccs.tencentyun.com\"]}\\n' > /etc/docker/daemon.json && "
                "cat /etc/docker/daemon.json", sudo=True)
    rc, out = run(client, "bash /root/fitcheck/deploy/setup.sh", sudo=True, timeout=1800)
    if rc != 0:
        print("[错误] setup.sh 返回非 0，请检查上面日志")
        return rc

    print("[6/6] 验证服务…")
    time.sleep(3)
    run(client, "docker ps --format 'table {{.Names}}\\t{{.Status}}\\t{{.Ports}}'", sudo=True)
    rc, out = run(client, "curl -s -m 10 http://127.0.0.1:8000/api/health", sudo=True)
    print("[health]", out.strip())
    print("\n✅ 服务器端部署完成，访问地址： http://%s:8000" % HOST)
    client.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
