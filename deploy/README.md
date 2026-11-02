# FitCheck 云服务器部署指南（Ubuntu + Docker）

## 1. 买服务器

- 腾讯云/阿里云轻量应用服务器即可：**2 核 2G、Ubuntu 22.04/24.04**（一年几十元）；
- 记下公网 IP；在云控制台**安全组/防火墙放行 8000 端口**（TCP）。

## 2. 上传代码

方式一（scp，Windows 在 PowerShell 里执行；也可先运行 `deploy\pack.ps1` 一键打包成 `fitcheck-upload.zip`）：

```powershell
scp -r C:\Users\21684\Documents\deepseek-harness\default-workspace\fitcheck root@服务器IP:/root/
```

方式二（推荐，便于以后更新）：把项目放到你自己的 GitHub **私有仓库**，服务器 `git clone`，更新时 `git pull`。

## 3. 服务器上一条命令部署（推荐）

上传完成后，在服务器上执行：

```bash
cd /root/fitcheck
bash deploy/setup.sh
```

脚本会自动：安装 Docker → 询问并写入 DeepSeek Key → 构建并启动 → 放行 ufw 防火墙 → 打印访问地址。之后按提示到云控制台安全组放行 8000 端口即可。

> 国内服务器拉取 Docker 镜像慢时，可配置镜像加速器（编辑 `/etc/docker/daemon.json` 增加 registry-mirrors，然后 `systemctl restart docker`）。

### 手动部署（不用 setup.sh）

```bash
cd /root/fitcheck/deploy
echo 'DEEPSEEK_API_KEY=sk-你的key' > .env
docker compose up -d --build
```

## 4. 验证

浏览器打开 `http://服务器IP:8000/`，能看到登录页即可。
（AI 功能是否启用可访问 `http://服务器IP:8000/api/config/public` 查看 `ai_enabled`）

## 5. 可选：域名 + HTTPS

1. 域名解析 A 记录 → 服务器 IP；
2. 服务器装 Caddy，`/etc/caddy/Caddyfile`：

```
fit.example.com {
    reverse_proxy 127.0.0.1:8000
}
```

3. `systemctl reload caddy`，之后访问 `https://fit.example.com`（HTTPS 自动签发证书）。

> 提醒：要开浏览器通知（Notification）需要 HTTPS，所以正式用推荐配域名。

## 6. 数据备份

数据都在 Docker volume 里，主机执行 `deploy/backup.sh` 生成备份，建议加到 crontab：

```bash
chmod +x /root/fitcheck/deploy/backup.sh
crontab -e
# 每天凌晨 4 点备份，保留最近 14 份
0 4 * * * /root/fitcheck/deploy/backup.sh
```

## 7. 更新版本

```bash
cd /root/fitcheck
git pull        # 或重新 scp
cd deploy
docker compose up -d --build
```

数据库在 volume `fitcheck-data` 里，重新构建不会丢数据。

## 8. 说明

- 默认 AI 使用管理员配置的 DeepSeek key（deploy/.env），请到 DeepSeek 开放平台设置**消费限额**；
- 「每人填自己的 key」功能已上线：在网页设置页填写自己的 DeepSeek Key 后，生成计划优先使用个人 Key；留空则使用圈主配置的 Key。
