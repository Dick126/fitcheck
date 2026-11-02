# FitCheck 前后端接口约定（v1）

Base URL：`http://127.0.0.1:8000`
认证：`Authorization: Bearer <token>`（登录/注册返回 `token`）
统一响应：成功 `{"ok": true, "data": ...}`；失败 `{"ok": false, "error": "..."}`（HTTP 4xx/5xx）

## 认证

- `POST /api/auth/register`  `{username, password, nickname}` → `{token, user:{id, username, nickname}}`
- `POST /api/auth/login`  `{username, password}` → 同上
- `GET /api/auth/me` → `{user:{id, username, nickname}}`

## 个人资料

- `GET /api/profile` → `{height_cm, gender:"male|female", birth_year, goal:"lean_muscle|cut|shape", equipment:"gym|home", days_per_week, training_time, remind_time, has_api_key:true|false}`（`has_api_key` 表示该用户是否设置了私有 DeepSeek Key；**Key 本身永不回传**）
- `PUT /api/profile` 提交同结构（可只传部分字段），另可传 `api_key`（字符串；空字符串表示清除，之后使用圈主提供的 Key）

## 身体数据

- `GET /api/body/records` → `[{id, date, weight_kg, body_fat, muscle_kg, waist_cm, note, created_at}]`（倒序，最多 365 条）
- `POST /api/body/records`  `{date:"YYYY-MM-DD", weight_kg, body_fat, muscle_kg, waist_cm, note}`
- `DELETE /api/body/records/{id}`

## 计划

- `POST /api/plans/generate` `{goal?}` → 根据资料+最新体重生成并保存，返回：
```json
{
  "week_start": "2026-11-02",
  "goal": "lean_muscle",
  "diet": {"kcal": 2750, "protein": 125, "fat": 65, "carbs": 420,
           "meals": [{"name":"早餐","content":"...","kcal":720}, ...]},
  "days": [
    {"index":1, "title":"周一 · 上肢推", "warmup":"...",
     "exercises":[{"name":"杠铃平板卧推","equipment":"卧推架+杠铃","sets":"4×6–8","rest":"120s","note":"..."}]},
    {"index":6, "title":"周六 · 有氧+核心", "exercises":[...]},
    {"index":7, "title":"周日 · 休息"}
  ],
  "coach_note": "AI 教练的一段话（未配置 API 时为规则生成的默认话）"
}
```
- `GET /api/plans/current` → 最新计划或 `null`

## 打卡

- `GET /api/checkins?month=2026-11` → 我该月的打卡数组：
```json
[{"id":1,"date":"2026-11-02","status":"done|rest|skip",
  "plan_items":[{"name":"杠铃平板卧推","sets":"4","reps":"8","weight":"50","done":true}],
  "custom_items":["椭圆机 30min"],
  "notes":"...","mood":4,"energy":4,"visibility":"public|private",
  "completed_at":"...","user_id":1,"nickname":"..."}]
```
- `POST /api/checkins` `{date, status, plan_items:[], custom_items:[], notes, mood, energy, visibility}`
- `PUT /api/checkins/{id}`（同 POST 结构，改自己的）
- `DELETE /api/checkins/{id}`

## 圈子（好友）

- `POST /api/circles` `{name}` → `{id, name, invite_code}`
- `POST /api/circles/join` `{invite_code}`
- `GET /api/circles/mine` → `[{id, name, invite_code, is_owner, member_count}]`
- `GET /api/circles/{id}/members` → `[{user_id, nickname, is_owner}]`

## 好友动态 / 排行

- `GET /api/feed` → 同圈子好友最近 14 天公开打卡（含 nickname、liked_by_me）
- `GET /api/circles/{id}/leaderboard?days=7` → `[{user_id, nickname, done_count, streak}]`
- `POST /api/checkins/{id}/like`、`DELETE /api/checkins/{id}/like`（点赞/取消）

## 统计与配置

- `GET /api/stats` → `{streak, week_done, total_checkins, circle_count}`
- `GET /api/config/public` → `{ai_enabled: true|false}`
- `GET /api/health` → `{ok:true}`

## 前端约定

- token 存 `localStorage.fitcheck_token`；收到 401 自动回登录页。
- 所有日期为本地日期字符串 `YYYY-MM-DD`。
- 身体数据、私密打卡只对自己可见；公开打卡对同圈子好友可见。
