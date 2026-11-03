"""在云服务器上生成 GitHub 只读部署密钥，并做好 ssh 配置。"""
import os
import sys

import paramiko

HOST = os.environ.get("FH", "")
PASS = os.environ.get("FP", "")

SETUP = [
    "mkdir -p /root/.ssh && chmod 700 /root/.ssh",
    "[ -f /root/.ssh/fitcheck_deploy ] || ssh-keygen -t ed25519 -f /root/.ssh/fitcheck_deploy -N '' -C 'fitcheck-deploy'",
    "ssh-keyscan -t ed25519 github.com >> /root/.ssh/known_hosts 2>/dev/null || true",
    "printf 'Host github.com\\n  HostName github.com\\n  User git\\n  IdentityFile /root/.ssh/fitcheck_deploy\\n  IdentitiesOnly yes\\n' > /root/.ssh/config",
    "chmod 600 /root/.ssh/config /root/.ssh/fitcheck_deploy /root/.ssh/known_hosts",
    "cat /root/.ssh/fitcheck_deploy.pub",
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

    pub = ""
    for cmd in SETUP:
        if user != "root":
            cmd = "echo '%s' | sudo -S bash -c %r" % (PASS, cmd)
        _, out, err = client.exec_command(cmd, timeout=60)
        text = (out.read().decode("utf-8", "replace") + err.read().decode("utf-8", "replace")).strip()
        if text:
            print(text)
        if "ssh-ed25519" in text:
            pub = text
    client.close()
    print("\n==== 公钥（复制到 GitHub Deploy Key） ====")
    print(pub)


if __name__ == "__main__":
    main()
