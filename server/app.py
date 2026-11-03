"""FitCheck 后端：FastAPI + SQLite。"""
from __future__ import annotations

import hashlib
import json
import os
import secrets
import sqlite3
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta
from pathlib import Path

import jwt
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

BASE = Path(__file__).resolve().parent
WEB_DIR = BASE.parent / "web"
DB_PATH = Path(os.environ.get("FITCHECK_DB", str(BASE / "fitcheck.db")))
SECRET_PATH = Path(os.environ.get("FITCHECK_SECRET", str(BASE / "secret.key")))
DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions"


def load_env():
    env_file = BASE / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.lstrip("\ufeff").strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                os.environ.setdefault(key.strip(), value.strip())


load_env()

app = FastAPI(title="FitCheck")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------- 数据库 ----------------
SCHEMA = """
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  nickname TEXT NOT NULL,
  pw_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS profiles(
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  height_cm REAL, gender TEXT DEFAULT 'male',
  birth_year INTEGER, goal TEXT DEFAULT 'lean_muscle',
  equipment TEXT DEFAULT 'gym',
  days_per_week INTEGER DEFAULT 4,
  training_time TEXT DEFAULT 'morning',
  remind_time TEXT DEFAULT '07:00'
);
CREATE TABLE IF NOT EXISTS body_records(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  weight_kg REAL, body_fat REAL, muscle_kg REAL, waist_cm REAL,
  note TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS plans(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  week_start TEXT NOT NULL,
  goal TEXT,
  payload TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS checkins(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  status TEXT DEFAULT 'done',
  plan_items TEXT DEFAULT '[]',
  custom_items TEXT DEFAULT '[]',
  notes TEXT DEFAULT '',
  mood INTEGER, energy INTEGER,
  visibility TEXT DEFAULT 'public',
  completed_at TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_checkins_user_date ON checkins(user_id, date);
CREATE TABLE IF NOT EXISTS circles(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  invite_code TEXT UNIQUE NOT NULL,
  owner_id INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS circle_members(
  circle_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  role TEXT DEFAULT 'member',
  joined_at TEXT DEFAULT (datetime('now','localtime')),
  PRIMARY KEY (circle_id, user_id)
);
CREATE TABLE IF NOT EXISTS likes(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  checkin_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  UNIQUE(checkin_id, user_id)
);
"""


def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB_PATH)
    con.executescript(SCHEMA)
    cols = [r[1] for r in con.execute("PRAGMA table_info(profiles)")]
    if "api_key" not in cols:
        con.execute("ALTER TABLE profiles ADD COLUMN api_key TEXT DEFAULT ''")
    cols = [r[1] for r in con.execute("PRAGMA table_info(circles)")]
    if "notice" not in cols:
        con.execute("ALTER TABLE circles ADD COLUMN notice TEXT DEFAULT ''")
    con.commit()
    con.close()


init_db()


def db() -> sqlite3.Connection:
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con


def now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


# ---------------- 认证 ----------------
def get_secret() -> str:
    if not SECRET_PATH.exists():
        SECRET_PATH.write_text(secrets.token_hex(32), encoding="utf-8")
    return SECRET_PATH.read_text(encoding="utf-8").strip()


def hash_pw(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac(
        "sha256", password.encode(), bytes.fromhex(salt), 100_000
    ).hex()


def make_token(user_id: int) -> str:
    payload = {"sub": str(user_id), "exp": datetime.utcnow() + timedelta(days=30)}
    return jwt.encode(payload, get_secret(), algorithm="HS256")


def current_user(authorization: str = Header(default="")) -> sqlite3.Row:
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(401, "未登录")
    try:
        payload = jwt.decode(token, get_secret(), algorithms=["HS256"])
        uid = int(payload["sub"])
    except Exception:
        raise HTTPException(401, "登录已过期，请重新登录")
    con = db()
    user = con.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
    con.close()
    if not user:
        raise HTTPException(401, "用户不存在")
    return user


class RegisterIn(BaseModel):
    username: str
    password: str
    nickname: str = ""


class LoginIn(BaseModel):
    username: str
    password: str


@app.post("/api/auth/register")
def register(body: RegisterIn):
    username = body.username.strip()
    if len(username) < 2 or len(username) > 24:
        raise HTTPException(400, "用户名需 2–24 个字符")
    if len(body.password) < 6:
        raise HTTPException(400, "密码至少 6 位")
    con = db()
    if con.execute("SELECT 1 FROM users WHERE username=?", (username,)).fetchone():
        con.close()
        raise HTTPException(400, "用户名已被占用")
    salt = secrets.token_hex(16)
    nickname = body.nickname.strip() or username
    cur = con.execute(
        "INSERT INTO users(username, nickname, pw_hash, salt) VALUES (?,?,?,?)",
        (username, nickname, hash_pw(body.password, salt), salt),
    )
    con.execute(
        "INSERT INTO profiles(user_id) VALUES (?)", (cur.lastrowid,)
    )
    con.commit()
    user_id = cur.lastrowid
    con.close()
    return {"ok": True, "data": {
        "token": make_token(user_id),
        "user": {"id": user_id, "username": username, "nickname": nickname},
    }}


@app.post("/api/auth/login")
def login(body: LoginIn):
    con = db()
    row = con.execute("SELECT * FROM users WHERE username=?", (body.username.strip(),)).fetchone()
    con.close()
    if not row or row["pw_hash"] != hash_pw(body.password, row["salt"]):
        raise HTTPException(401, "用户名或密码错误")
    return {"ok": True, "data": {
        "token": make_token(row["id"]),
        "user": {"id": row["id"], "username": row["username"], "nickname": row["nickname"]},
    }}


class ChangePasswordIn(BaseModel):
    old_password: str
    new_password: str


@app.post("/api/auth/change-password")
def change_password(body: ChangePasswordIn, authorization: str = Header(default="")):
    user = _current(authorization)
    if len(body.new_password) < 6:
        raise HTTPException(400, "新密码至少 6 位")
    if user["pw_hash"] != hash_pw(body.old_password, user["salt"]):
        raise HTTPException(400, "原密码不正确")
    salt = secrets.token_hex(16)
    con = db()
    con.execute(
        "UPDATE users SET pw_hash=?, salt=? WHERE id=?",
        (hash_pw(body.new_password, salt), salt, user["id"]),
    )
    con.commit()
    con.close()
    return {"ok": True, "data": None}


@app.get("/api/auth/me")
def me(authorization: str = Header(default="")):
    user = _current(authorization)
    return {"ok": True, "data": {"user": {
        "id": user["id"], "username": user["username"], "nickname": user["nickname"],
    }}}


def _current(authorization: str) -> sqlite3.Row:
    return current_user(authorization)


# ---------------- 资料 ----------------
class ProfileIn(BaseModel):
    height_cm: float | None = None
    gender: str | None = None
    birth_year: int | None = None
    goal: str | None = None
    equipment: str | None = None
    days_per_week: int | None = None
    training_time: str | None = None
    remind_time: str | None = None
    api_key: str | None = None
    nickname: str | None = None


@app.get("/api/profile")
def get_profile(authorization: str = Header(default="")):
    user = _current(authorization)
    con = db()
    row = con.execute(
        "SELECT p.*, u.nickname FROM profiles p JOIN users u ON u.id=p.user_id WHERE p.user_id=?",
        (user["id"],),
    ).fetchone()
    con.close()
    if row:
        data = {k: row[k] for k in row.keys() if k not in ("user_id", "api_key")}
        data["has_api_key"] = bool(row["api_key"])
    else:
        data = {}
    return {"ok": True, "data": data}


@app.put("/api/profile")
def put_profile(body: ProfileIn, authorization: str = Header(default="")):
    user = _current(authorization)
    payload = body.model_dump()
    nickname = payload.pop("nickname", None)
    updates = {k: v for k, v in payload.items() if v is not None}
    if "api_key" in updates:
        updates["api_key"] = updates["api_key"].strip()
    con = db()
    if nickname is not None:
        nickname = nickname.strip()
        if not (1 <= len(nickname) <= 24):
            con.close()
            raise HTTPException(400, "昵称需 1–24 个字符")
        con.execute("UPDATE users SET nickname=? WHERE id=?", (nickname, user["id"]))
        updates["nickname"] = nickname
    if updates:
        cols = ", ".join(f"{k}=?" for k in updates if k != "nickname")
        values = [v for k, v in updates.items() if k != "nickname"]
        if cols:
            con.execute(f"UPDATE profiles SET {cols} WHERE user_id=?", (*values, user["id"]))
    con.commit()
    con.close()
    return {"ok": True, "data": updates}


# ---------------- 身体数据 ----------------
class BodyRecordIn(BaseModel):
    date: str
    weight_kg: float | None = None
    body_fat: float | None = None
    muscle_kg: float | None = None
    waist_cm: float | None = None
    note: str = ""


@app.get("/api/body/records")
def body_records(authorization: str = Header(default="")):
    user = _current(authorization)
    con = db()
    rows = con.execute(
        "SELECT * FROM body_records WHERE user_id=? ORDER BY date DESC, id DESC LIMIT 365",
        (user["id"],),
    ).fetchall()
    con.close()
    return {"ok": True, "data": [dict(r) for r in rows]}


@app.post("/api/body/records")
def add_body_record(body: BodyRecordIn, authorization: str = Header(default="")):
    user = _current(authorization)
    con = db()
    cur = con.execute(
        "INSERT INTO body_records(user_id, date, weight_kg, body_fat, muscle_kg, waist_cm, note)"
        " VALUES (?,?,?,?,?,?,?)",
        (user["id"], body.date, body.weight_kg, body.body_fat,
         body.muscle_kg, body.waist_cm, body.note),
    )
    con.commit()
    row = con.execute("SELECT * FROM body_records WHERE id=?", (cur.lastrowid,)).fetchone()
    con.close()
    return {"ok": True, "data": dict(row)}


@app.delete("/api/body/records/{record_id}")
def del_body_record(record_id: int, authorization: str = Header(default="")):
    user = _current(authorization)
    con = db()
    cur = con.execute(
        "DELETE FROM body_records WHERE id=? AND user_id=?", (record_id, user["id"])
    )
    con.commit()
    con.close()
    if cur.rowcount == 0:
        raise HTTPException(404, "记录不存在")
    return {"ok": True, "data": None}


# ---------------- 计划生成 ----------------
EXERCISE_DAYS = [
    {
        "index": 1, "title": "周一 · 上肢推（胸、肩、三头）",
        "warmup": "快走/椭圆机 5 分钟 → 弹力带肩外旋 2×15 → 胸椎旋转 2×8/侧 → 空杆卧推 2×15",
        "exercises": [
            {"name": "杠铃平板卧推", "equipment": "卧推架 + 杠铃", "sets": "4×6–8", "rest": "120s", "note": "肩胛后缩下沉"},
            {"name": "上斜哑铃卧推", "equipment": "可调凳(30°) + 哑铃", "sets": "3×8–10", "rest": "90s", "note": "肘部约 45°"},
            {"name": "坐姿哑铃推举", "equipment": "靠背凳 + 哑铃", "sets": "3×8–10", "rest": "90s", "note": "核心收紧"},
            {"name": "绳索侧平举", "equipment": "龙门架", "sets": "3×12–15", "rest": "60s", "note": "小重量，用肩中束抬"},
            {"name": "绳索下压", "equipment": "龙门架 + 绳索", "sets": "3×10–12", "rest": "60s", "note": "大臂固定"},
            {"name": "面拉", "equipment": "龙门架 + 绳索", "sets": "3×15", "rest": "60s", "note": "拉向额头"},
        ],
    },
    {
        "index": 2, "title": "周二 · 下肢蹲（股四头、臀、小腿）",
        "warmup": "单车 5 分钟 → 髋绕环、踝背屈 → 徒手深蹲 2×15 → 空杆深蹲 2×10",
        "exercises": [
            {"name": "高杠杠铃深蹲", "equipment": "深蹲架 + 杠铃", "sets": "4×6–8", "rest": "120s", "note": "膝盖对准脚尖"},
            {"name": "腿举", "equipment": "腿举机", "sets": "3×10–12", "rest": "90s", "note": "膝盖不锁死"},
            {"name": "哑铃箭步蹲", "equipment": "哑铃", "sets": "3×10/腿", "rest": "90s", "note": "先做弱侧"},
            {"name": "坐姿腿屈伸", "equipment": "腿屈伸机", "sets": "3×12–15", "rest": "60s", "note": "顶峰收缩 1 秒"},
            {"name": "站姿提踵", "equipment": "提踵机/史密斯", "sets": "4×15", "rest": "45s", "note": "全幅度"},
            {"name": "平板支撑", "equipment": "瑜伽垫", "sets": "3×45–60s", "rest": "45s", "note": "臀夹紧"},
        ],
    },
    {
        "index": 3, "title": "周三 · 恢复",
        "warmup": "无",
        "exercises": [
            {"name": "快走 / 拉伸", "equipment": "无", "sets": "30 分钟", "rest": "-", "note": "主动恢复，为周四蓄力"},
        ],
    },
    {
        "index": 4, "title": "周四 · 上肢拉（背、后束、二头）",
        "warmup": "划船机/快走 5 分钟 → 弹力带下拉 2×15 → 肩胛俯卧撑 2×10",
        "exercises": [
            {"name": "引体向上/高位下拉", "equipment": "单杠/下拉机", "sets": "4×6–10", "rest": "120s", "note": "先沉肩再拉"},
            {"name": "杠铃俯身划船", "equipment": "杠铃", "sets": "4×8–10", "rest": "90s", "note": "背角 45°，拉向肚脐"},
            {"name": "单臂哑铃划船", "equipment": "哑铃 + 平板凳", "sets": "3×10/侧", "rest": "60s", "note": "顶峰夹背"},
            {"name": "直臂下压/反向飞鸟", "equipment": "龙门架/哑铃", "sets": "3×12–15", "rest": "60s", "note": "后束或背阔下部"},
            {"name": "哑铃弯举", "equipment": "哑铃", "sets": "3×10–12", "rest": "60s", "note": "不借力"},
            {"name": "锤式弯举", "equipment": "哑铃", "sets": "3×12", "rest": "60s", "note": "练肱肌"},
        ],
    },
    {
        "index": 5, "title": "周五 · 下肢髋（臀、腘绳肌、小腿）",
        "warmup": "单车 5 分钟 → 臀桥 2×15、蚌式 2×15/侧 → 空杆髋铰链 2×10",
        "exercises": [
            {"name": "罗马尼亚硬拉", "equipment": "杠铃", "sets": "4×8–10", "rest": "120s", "note": "髋后推，杠贴腿"},
            {"name": "杠铃臀推", "equipment": "杠铃 + 长凳", "sets": "4×8–12", "rest": "90s", "note": "顶峰夹臀 2 秒"},
            {"name": "保加利亚分腿蹲", "equipment": "哑铃 + 长凳", "sets": "3×10/腿", "rest": "90s", "note": "重心在前脚"},
            {"name": "俯卧腿弯举", "equipment": "腿弯举机", "sets": "3×12", "rest": "60s", "note": "下放控制 2 秒"},
            {"name": "站姿提踵", "equipment": "提踵机/史密斯", "sets": "4×15", "rest": "45s", "note": "与周二错开角度"},
            {"name": "悬垂举腿", "equipment": "单杠", "sets": "3×10–15", "rest": "45s", "note": "练下腹"},
        ],
    },
    {
        "index": 6, "title": "周六 · 有氧 + 核心",
        "warmup": "无",
        "exercises": [
            {"name": "有氧", "equipment": "快走/慢跑/单车", "sets": "25–30 分钟", "rest": "-", "note": "心率 120–140"},
            {"name": "死虫", "equipment": "瑜伽垫", "sets": "3×12/侧", "rest": "60s", "note": ""},
            {"name": "侧平板", "equipment": "瑜伽垫", "sets": "3×30s/侧", "rest": "45s", "note": ""},
            {"name": "卷腹", "equipment": "瑜伽垫", "sets": "3×15", "rest": "45s", "note": ""},
        ],
    },
    {
        "index": 7, "title": "周日 · 休息",
        "warmup": "拉伸、放松、睡够 8 小时",
        "exercises": [],
    },
]

GOAL_ADJUST = {
    "lean_muscle": {"kcal": 300, "protein": 2.0, "label": "增肌（薄肌）"},
    "cut": {"kcal": -300, "protein": 2.2, "label": "减脂"},
    "shape": {"kcal": 0, "protein": 1.8, "label": "塑形维持"},
}


def calc_diet(profile: dict, weight: float) -> dict:
    gender = profile.get("gender") or "male"
    height = profile.get("height_cm") or 175
    age = 20 if not profile.get("birth_year") else max(12, date.today().year - profile["birth_year"])
    goal = profile.get("goal") or "lean_muscle"
    adjust = GOAL_ADJUST.get(goal, GOAL_ADJUST["lean_muscle"])

    bmr = 10 * weight + 6.25 * height - 5 * age + (5 if gender == "male" else -161)
    tdee = bmr * 1.55
    kcal = round(tdee + adjust["kcal"], -1)
    protein = round(weight * adjust["protein"])
    fat = round(weight * 1.0)
    carbs = max(100, round((kcal - protein * 4 - fat * 9) / 4))
    meals = [
        {"name": "早餐", "content": f"燕麦 70g + 牛奶 250ml + 鸡蛋 2 个 + 水果 1 份", "kcal": 650},
        {"name": "午餐", "content": f"米饭 {200 + int(goal=='lean_muscle')*100}g（熟）+ 瘦肉/鱼虾 150g + 蔬菜 300g", "kcal": 750},
        {"name": "加餐", "content": "酸奶 150g + 坚果 15g（或蛋白粉 1 勺）", "kcal": 300},
        {"name": "晚餐", "content": "米饭 200g（熟）+ 蛋白 150g + 蔬菜 300g", "kcal": 650},
        {"name": "睡前", "content": "牛奶 250ml（可选）", "kcal": 120},
    ]
    if goal == "cut":
        meals[0]["content"] = "燕麦 50g + 鸡蛋 2 个 + 水果 1 份"
        meals[0]["kcal"] = 500
        meals[1]["content"] = "米饭 200g（熟）+ 瘦肉 150g + 蔬菜 400g"
        meals[1]["kcal"] = 650
        meals[4]["kcal"] = 0
    return {
        "kcal": kcal, "protein": protein, "fat": fat, "carbs": carbs,
        "bmr": round(bmr), "goal_label": adjust["label"], "meals": meals,
    }


def default_coach_note(profile: dict, diet: dict) -> str:
    goal = diet["goal_label"]
    return (
        f"本周目标：{goal}。每天热量约 {diet['kcal']} kcal，蛋白质 {diet['protein']} g，"
        "训练按计划 4 练 + 1 有氧，重点做好动作质量与渐进加重；"
        "连续两周体重无变化就每天再加 150–200 kcal，睡够 8 小时。"
    )


def llm_coach_note(profile: dict, diet: dict, api_key: str = "") -> str | None:
    key = (api_key or "").strip() or os.environ.get("DEEPSEEK_API_KEY", "")
    if not key:
        return None
    try:
        prompt = (
            "你是一位健身教练。根据以下数据给用户写一段不超过 150 字的本周计划说明"
            "（包含 1–2 条具体调整建议和一句鼓励），只输出正文，不要标题、不要列表。\n"
            f"性别:{profile.get('gender')} 身高:{profile.get('height_cm')}cm "
            f"目标:{diet['goal_label']} 每天热量:{diet['kcal']}kcal 蛋白质:{diet['protein']}g "
            f"碳水:{diet['carbs']}g 每周训练:{profile.get('days_per_week')}天 "
            f"时段:{profile.get('training_time')} 器械:{profile.get('equipment')}"
        )
        payload = {
            "model": "deepseek-chat",
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.8,
            "max_tokens": 300,
        }
        req = urllib.request.Request(
            DEEPSEEK_URL,
            data=json.dumps(payload).encode(),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {key}",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = json.loads(resp.read().decode())
        text = body["choices"][0]["message"]["content"].strip()
        return text[:300] or None
    except Exception:
        return None


def build_plan(profile: dict, weight: float, goal_override: str | None = None,
               api_key: str = "") -> dict:
    if goal_override:
        profile = {**profile, "goal": goal_override}
    diet = calc_diet(profile, weight)
    monday = date.today() - timedelta(days=date.today().weekday())
    days = json.loads(json.dumps(EXERCISE_DAYS, ensure_ascii=False))
    note = llm_coach_note(profile, diet, api_key) or default_coach_note(profile, diet)
    return {
        "week_start": monday.isoformat(),
        "goal": profile.get("goal") or "lean_muscle",
        "weight": weight,
        "diet": diet,
        "days": days,
        "coach_note": note,
    }


class PlanGenIn(BaseModel):
    goal: str | None = None


@app.post("/api/plans/generate")
def generate_plan(body: PlanGenIn | None = None, authorization: str = Header(default="")):
    user = _current(authorization)
    con = db()
    profile = con.execute(
        "SELECT * FROM profiles WHERE user_id=?", (user["id"],)
    ).fetchone()
    last = con.execute(
        "SELECT weight_kg FROM body_records WHERE user_id=? AND weight_kg IS NOT NULL "
        "ORDER BY date DESC, id DESC LIMIT 1",
        (user["id"],),
    ).fetchone()
    con.close()
    profile = {k: profile[k] for k in profile.keys()} if profile else {}
    weight = float(last["weight_kg"]) if last and last["weight_kg"] else 60.0
    goal_override = (body.goal if body and body.goal else None)
    plan = build_plan(profile, weight, goal_override, api_key=(profile.get("api_key") or ""))
    con = db()
    con.execute(
        "INSERT INTO plans(user_id, week_start, goal, payload) VALUES (?,?,?,?)",
        (user["id"], plan["week_start"], plan["goal"],
         json.dumps(plan, ensure_ascii=False)),
    )
    con.commit()
    con.close()
    return {"ok": True, "data": plan}


@app.get("/api/plans/current")
def current_plan(authorization: str = Header(default="")):
    user = _current(authorization)
    con = db()
    row = con.execute(
        "SELECT payload FROM plans WHERE user_id=? ORDER BY id DESC LIMIT 1",
        (user["id"],),
    ).fetchone()
    con.close()
    return {"ok": True, "data": json.loads(row["payload"]) if row else None}


# ---------------- 打卡 ----------------
class CheckinIn(BaseModel):
    date: str
    status: str = "done"
    plan_items: list = []
    custom_items: list = []
    notes: str = ""
    mood: int | None = None
    energy: int | None = None
    visibility: str = "public"


def row_to_checkin(row: sqlite3.Row, con: sqlite3.Connection, me_id: int) -> dict:
    d = dict(row)
    d["plan_items"] = json.loads(d.get("plan_items") or "[]")
    d["custom_items"] = json.loads(d.get("custom_items") or "[]")
    liked = con.execute(
        "SELECT 1 FROM likes WHERE checkin_id=? AND user_id=?",
        (d["id"], me_id),
    ).fetchone()
    d["liked_by_me"] = bool(liked)
    d["like_count"] = con.execute(
        "SELECT COUNT(*) FROM likes WHERE checkin_id=?", (d["id"],)
    ).fetchone()[0]
    return d


@app.get("/api/checkins")
def list_checkins(month: str = "", authorization: str = Header(default="")):
    user = _current(authorization)
    con = db()
    if month:
        rows = con.execute(
            "SELECT c.*, u.nickname FROM checkins c JOIN users u ON u.id=c.user_id "
            "WHERE c.user_id=? AND substr(c.date,1,7)=? ORDER BY c.date DESC, c.id DESC",
            (user["id"], month),
        ).fetchall()
    else:
        rows = con.execute(
            "SELECT c.*, u.nickname FROM checkins c JOIN users u ON u.id=c.user_id "
            "WHERE c.user_id=? ORDER BY c.date DESC, c.id DESC LIMIT 60",
            (user["id"],),
        ).fetchall()
    data = [row_to_checkin(r, con, user["id"]) for r in rows]
    con.close()
    return {"ok": True, "data": data}


@app.post("/api/checkins")
def add_checkin(body: CheckinIn, authorization: str = Header(default="")):
    user = _current(authorization)
    con = db()
    old = con.execute(
        "SELECT id FROM checkins WHERE user_id=? AND date=?",
        (user["id"], body.date),
    ).fetchone()
    if old:
        con.close()
        raise HTTPException(409, "这一天已经打过卡，请直接编辑")
    cur = con.execute(
        "INSERT INTO checkins(user_id, date, status, plan_items, custom_items, notes,"
        " mood, energy, visibility, completed_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
        (user["id"], body.date, body.status,
         json.dumps(body.plan_items, ensure_ascii=False),
         json.dumps(body.custom_items, ensure_ascii=False),
         body.notes, body.mood, body.energy, body.visibility, now()),
    )
    con.commit()
    row = con.execute(
        "SELECT c.*, u.nickname FROM checkins c JOIN users u ON u.id=c.user_id WHERE c.id=?",
        (cur.lastrowid,),
    ).fetchone()
    data = row_to_checkin(row, con, user["id"])
    con.close()
    return {"ok": True, "data": data}


@app.put("/api/checkins/{checkin_id}")
def edit_checkin(checkin_id: int, body: CheckinIn, authorization: str = Header(default="")):
    user = _current(authorization)
    con = db()
    row = con.execute(
        "SELECT * FROM checkins WHERE id=? AND user_id=?", (checkin_id, user["id"])
    ).fetchone()
    if not row:
        con.close()
        raise HTTPException(404, "打卡不存在")
    dup = con.execute(
        "SELECT id FROM checkins WHERE user_id=? AND date=? AND id!=?",
        (user["id"], body.date, checkin_id),
    ).fetchone()
    if dup:
        con.close()
        raise HTTPException(409, "这一天已经有打卡记录，请编辑那一条")
    con.execute(
        "UPDATE checkins SET date=?, status=?, plan_items=?, custom_items=?, notes=?,"
        " mood=?, energy=?, visibility=? WHERE id=?",
        (body.date, body.status,
         json.dumps(body.plan_items, ensure_ascii=False),
         json.dumps(body.custom_items, ensure_ascii=False),
         body.notes, body.mood, body.energy, body.visibility, checkin_id),
    )
    con.commit()
    row = con.execute(
        "SELECT c.*, u.nickname FROM checkins c JOIN users u ON u.id=c.user_id WHERE c.id=?",
        (checkin_id,),
    ).fetchone()
    data = row_to_checkin(row, con, user["id"])
    con.close()
    return {"ok": True, "data": data}


@app.delete("/api/checkins/{checkin_id}")
def del_checkin(checkin_id: int, authorization: str = Header(default="")):
    user = _current(authorization)
    con = db()
    cur = con.execute(
        "DELETE FROM checkins WHERE id=? AND user_id=?", (checkin_id, user["id"])
    )
    con.execute("DELETE FROM likes WHERE checkin_id=?", (checkin_id,))
    con.commit()
    con.close()
    if cur.rowcount == 0:
        raise HTTPException(404, "打卡不存在")
    return {"ok": True, "data": None}


# ---------------- 圈子 ----------------
class CircleIn(BaseModel):
    name: str = "健身小圈子"
    notice: str | None = None


@app.post("/api/circles")
def create_circle(body: CircleIn | None = None, authorization: str = Header(default="")):
    user = _current(authorization)
    name = (body.name.strip() if body and body.name and body.name.strip() else "健身小圈子")
    notice = (body.notice.strip() if body and body.notice and body.notice.strip() else "")
    con = db()
    code = secrets.token_hex(3).upper()
    cur = con.execute(
        "INSERT INTO circles(name, invite_code, owner_id, notice) VALUES (?,?,?,?)",
        (name, code, user["id"], notice),
    )
    con.execute(
        "INSERT OR IGNORE INTO circle_members(circle_id, user_id, role) VALUES (?,?,?)",
        (cur.lastrowid, user["id"], "owner"),
    )
    con.commit()
    row = con.execute("SELECT * FROM circles WHERE id=?", (cur.lastrowid,)).fetchone()
    con.close()
    return {"ok": True, "data": dict(row)}


@app.post("/api/circles/join")
def join_circle(body: dict, authorization: str = Header(default="")):
    user = _current(authorization)
    code = (body.get("invite_code") or "").strip().upper()
    if not code:
        raise HTTPException(400, "请输入邀请码")
    con = db()
    circle = con.execute("SELECT * FROM circles WHERE invite_code=?", (code,)).fetchone()
    if not circle:
        con.close()
        raise HTTPException(404, "邀请码不存在")
    con.execute(
        "INSERT OR IGNORE INTO circle_members(circle_id, user_id, role) VALUES (?,?,?)",
        (circle["id"], user["id"], "member"),
    )
    con.commit()
    con.close()
    return {"ok": True, "data": {"id": circle["id"], "name": circle["name"]}}


@app.put("/api/circles/{circle_id}")
def edit_circle(circle_id: int, body: CircleIn, authorization: str = Header(default="")):
    user = _current(authorization)
    con = db()
    circle = con.execute("SELECT * FROM circles WHERE id=?", (circle_id,)).fetchone()
    if not circle:
        con.close()
        raise HTTPException(404, "圈子不存在")
    if circle["owner_id"] != user["id"]:
        con.close()
        raise HTTPException(403, "只有圈主可以修改圈子")
    name = (body.name.strip() if body.name and body.name.strip() else circle["name"])
    notice = (body.notice.strip() if body.notice is not None and body.notice.strip() else "")
    con.execute(
        "UPDATE circles SET name=?, notice=? WHERE id=?",
        (name, notice, circle_id),
    )
    con.commit()
    row = con.execute("SELECT * FROM circles WHERE id=?", (circle_id,)).fetchone()
    con.close()
    return {"ok": True, "data": dict(row)}


@app.post("/api/circles/{circle_id}/leave")
def leave_circle(circle_id: int, authorization: str = Header(default="")):
    user = _current(authorization)
    con = db()
    circle = con.execute("SELECT * FROM circles WHERE id=?", (circle_id,)).fetchone()
    if not circle:
        con.close()
        raise HTTPException(404, "圈子不存在")
    if circle["owner_id"] == user["id"]:
        con.close()
        raise HTTPException(403, "圈主不能直接退出，可解散圈子")
    cur = con.execute(
        "DELETE FROM circle_members WHERE circle_id=? AND user_id=?",
        (circle_id, user["id"]),
    )
    if cur.rowcount == 0:
        con.close()
        raise HTTPException(404, "你不在这个圈子里")
    left = con.execute(
        "SELECT COUNT(*) FROM circle_members WHERE circle_id=?", (circle_id,)
    ).fetchone()[0]
    if left == 0:
        con.execute("DELETE FROM circles WHERE id=?", (circle_id,))
    con.commit()
    con.close()
    return {"ok": True, "data": None}


@app.delete("/api/circles/{circle_id}/members/{target_id}")
def remove_member(circle_id: int, target_id: int, authorization: str = Header(default="")):
    user = _current(authorization)
    con = db()
    circle = con.execute("SELECT * FROM circles WHERE id=?", (circle_id,)).fetchone()
    if not circle:
        con.close()
        raise HTTPException(404, "圈子不存在")
    if circle["owner_id"] != user["id"]:
        con.close()
        raise HTTPException(403, "只有圈主可以移除成员")
    if target_id == circle["owner_id"]:
        con.close()
        raise HTTPException(400, "不能移除圈主")
    cur = con.execute(
        "DELETE FROM circle_members WHERE circle_id=? AND user_id=?",
        (circle_id, target_id),
    )
    con.commit()
    con.close()
    if cur.rowcount == 0:
        raise HTTPException(404, "该成员不在圈子里")
    return {"ok": True, "data": None}


@app.delete("/api/circles/{circle_id}")
def dissolve_circle(circle_id: int, authorization: str = Header(default="")):
    user = _current(authorization)
    con = db()
    circle = con.execute("SELECT * FROM circles WHERE id=?", (circle_id,)).fetchone()
    if not circle:
        con.close()
        raise HTTPException(404, "圈子不存在")
    if circle["owner_id"] != user["id"]:
        con.close()
        raise HTTPException(403, "只有圈主可以解散圈子")
    con.execute("DELETE FROM circle_members WHERE circle_id=?", (circle_id,))
    con.execute("DELETE FROM circles WHERE id=?", (circle_id,))
    con.commit()
    con.close()
    return {"ok": True, "data": None}


@app.get("/api/circles/mine")
def my_circles(authorization: str = Header(default="")):
    user = _current(authorization)
    con = db()
    rows = con.execute(
        "SELECT c.*, cm.role,"
        " (SELECT COUNT(*) FROM circle_members m WHERE m.circle_id=c.id) AS member_count "
        "FROM circles c JOIN circle_members cm ON cm.circle_id=c.id "
        "WHERE cm.user_id=? ORDER BY c.id",
        (user["id"],),
    ).fetchall()
    data = []
    for r in rows:
        d = dict(r)
        d["is_owner"] = d["role"] == "owner"
        data.append(d)
    con.close()
    return {"ok": True, "data": data}


@app.get("/api/circles/{circle_id}/members")
def circle_members(circle_id: int, authorization: str = Header(default="")):
    user = _current(authorization)
    con = db()
    in_circle = con.execute(
        "SELECT 1 FROM circle_members WHERE circle_id=? AND user_id=?",
        (circle_id, user["id"]),
    ).fetchone()
    if not in_circle:
        con.close()
        raise HTTPException(403, "你不在这个圈子里")
    rows = con.execute(
        "SELECT u.id AS user_id, u.nickname, cm.role FROM circle_members cm "
        "JOIN users u ON u.id=cm.user_id WHERE cm.circle_id=? ORDER BY cm.joined_at",
        (circle_id,),
    ).fetchall()
    today = date.today().isoformat()
    data = []
    for r in rows:
        done = con.execute(
            "SELECT 1 FROM checkins WHERE user_id=? AND date=? AND status='done'",
            (r["user_id"], today),
        ).fetchone()
        data.append({
            "user_id": r["user_id"],
            "nickname": r["nickname"],
            "is_owner": r["role"] == "owner",
            "today_done": bool(done),
        })
    con.close()
    return {"ok": True, "data": data}


# ---------------- 动态 / 排行 / 点赞 ----------------
@app.get("/api/feed")
def feed(authorization: str = Header(default="")):
    user = _current(authorization)
    con = db()
    rows = con.execute(
        "SELECT DISTINCT c.*, u.nickname FROM checkins c JOIN users u ON u.id=c.user_id "
        "WHERE c.visibility='public' AND c.user_id != ? "
        "AND c.date >= date('now','-14 day') "
        "AND c.user_id IN ("
        "  SELECT cm.user_id FROM circle_members cm WHERE cm.circle_id IN ("
        "    SELECT circle_id FROM circle_members WHERE user_id=?)) "
        "ORDER BY c.date DESC, c.id DESC LIMIT 100",
        (user["id"], user["id"]),
    ).fetchall()
    data = [row_to_checkin(r, con, user["id"]) for r in rows]
    con.close()
    return {"ok": True, "data": data}


def calc_streak(con: sqlite3.Connection, user_id: int) -> int:
    rows = con.execute(
        "SELECT DISTINCT date FROM checkins WHERE user_id=? AND status='done'",
        (user_id,),
    ).fetchall()
    have = {r["date"] for r in rows}
    d = date.today()
    if d.isoformat() not in have:
        d -= timedelta(days=1)
    streak = 0
    while d.isoformat() in have:
        streak += 1
        d -= timedelta(days=1)
    return streak


@app.get("/api/circles/{circle_id}/leaderboard")
def leaderboard(circle_id: int, days: int = 7, authorization: str = Header(default="")):
    user = _current(authorization)
    con = db()
    in_circle = con.execute(
        "SELECT 1 FROM circle_members WHERE circle_id=? AND user_id=?",
        (circle_id, user["id"]),
    ).fetchone()
    if not in_circle:
        con.close()
        raise HTTPException(403, "你不在这个圈子里")
    members = con.execute(
        "SELECT u.id AS user_id, u.nickname FROM circle_members cm "
        "JOIN users u ON u.id=cm.user_id WHERE cm.circle_id=?",
        (circle_id,),
    ).fetchall()
    data = []
    for m in members:
        done = con.execute(
            "SELECT COUNT(*) FROM checkins WHERE user_id=? AND status='done' "
            "AND date >= date('now', ?)",
            (m["user_id"], f"-{max(1, days)} day"),
        ).fetchone()[0]
        data.append({
            "user_id": m["user_id"],
            "nickname": m["nickname"],
            "done_count": done,
            "streak": calc_streak(con, m["user_id"]),
        })
    data.sort(key=lambda x: (-x["done_count"], -x["streak"]))
    con.close()
    return {"ok": True, "data": data}


@app.post("/api/checkins/{checkin_id}/like")
def like_checkin(checkin_id: int, authorization: str = Header(default="")):
    user = _current(authorization)
    con = db()
    con.execute(
        "INSERT OR IGNORE INTO likes(checkin_id, user_id) VALUES (?,?)",
        (checkin_id, user["id"]),
    )
    con.commit()
    count = con.execute(
        "SELECT COUNT(*) FROM likes WHERE checkin_id=?", (checkin_id,)
    ).fetchone()[0]
    con.close()
    return {"ok": True, "data": {"likes": count, "liked_by_me": True}}


@app.delete("/api/checkins/{checkin_id}/like")
def unlike_checkin(checkin_id: int, authorization: str = Header(default="")):
    user = _current(authorization)
    con = db()
    con.execute(
        "DELETE FROM likes WHERE checkin_id=? AND user_id=?", (checkin_id, user["id"])
    )
    con.commit()
    count = con.execute(
        "SELECT COUNT(*) FROM likes WHERE checkin_id=?", (checkin_id,)
    ).fetchone()[0]
    con.close()
    return {"ok": True, "data": {"likes": count, "liked_by_me": False}}


# ---------------- 统计 / 配置 ----------------
@app.get("/api/stats")
def stats(authorization: str = Header(default="")):
    user = _current(authorization)
    con = db()
    streak = calc_streak(con, user["id"])
    monday = date.today() - timedelta(days=date.today().weekday())
    week_done = con.execute(
        "SELECT COUNT(*) FROM checkins WHERE user_id=? AND status='done' AND date >= ?",
        (user["id"], monday.isoformat()),
    ).fetchone()[0]
    total = con.execute(
        "SELECT COUNT(*) FROM checkins WHERE user_id=?", (user["id"],)
    ).fetchone()[0]
    circles = con.execute(
        "SELECT COUNT(*) FROM circle_members WHERE user_id=?", (user["id"],)
    ).fetchone()[0]
    con.close()
    return {"ok": True, "data": {
        "streak": streak, "week_done": week_done,
        "total_checkins": total, "circle_count": circles,
    }}


@app.get("/api/config/public")
def config_public():
    return {"ok": True, "data": {
        "ai_enabled": bool(os.environ.get("DEEPSEEK_API_KEY")),
    }}


@app.get("/api/health")
def health():
    return {"ok": True, "data": {"time": now()}}


# ---------------- PWA ----------------
@app.get("/manifest.json")
def manifest():
    path = WEB_DIR / "manifest.json"
    if not path.exists():
        raise HTTPException(404, "manifest not found")
    return Response(
        content=path.read_bytes(),
        media_type="application/manifest+json",
    )


# ---------------- 静态前端 ----------------
WEB_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/", StaticFiles(directory=str(WEB_DIR), html=True), name="web")
