# FitCheck · 健身打卡小圈子

多用户健身打卡网页应用：上传身体数据 → 生成个性化健身/饮食计划（规则模板 + DeepSeek 个性化）→ 按模板每日打卡 + 心得总结 → 好友圈子互相查看打卡与排行 → 每日督促提醒。

## 项目结构

```
fitcheck/
├── server/            # FastAPI 后端（REST API + SQLite + 静态托管）
│   ├── app.py         # 全部接口与计划生成逻辑
│   ├── requirements.txt
│   └── .env           # DEEPSEEK_API_KEY=（不提交）
├── web/               # 前端静态页面（原生 HTML/CSS/JS，由后端托管）
├── docs/api.md        # 前后端接口约定
├── docs/使用手册.md   # 面向用户的操作手册
└── deploy/            # 云服务器部署（Docker Compose + 一键脚本 + 备份 + 指南）
```

## 本地开发

```powershell
cd fitcheck\server
python -m venv .venv
.\.venv\Scripts\python -m pip install -i https://pypi.tuna.tsinghua.edu.cn/simple -r requirements.txt
.\.venv\Scripts\python -m uvicorn app:app --host 127.0.0.1 --port 8000
```

浏览器打开 http://127.0.0.1:8000/

## 云服务器部署

见 `deploy/README.md`（Docker Compose，方案 B）。

## 接口

见 `docs/api.md`。将来转微信小程序时复用同一套 REST API。
