# 队员C 泳道2 后端：五 API + 估价引擎 + 二手入库

## 交付内容

仅改动本泳道目录：`lib/data.ts`、`lib/estimate.ts`、`app/api/**`、`scripts/**`。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/models` | 机型目录，支持 `?tier=1&brand=Apple` 过滤 |
| GET | `/api/prices/[model]` | 聚合 current + history + used 中位价 |
| POST | `/api/verify` | 照片验机，glm-4v-flash 主通道、qwen3-vl-plus 备通道 |
| GET/POST | `/api/report/[model]` | GET 读缓存 / POST 生成报告并写入 `data/reports/` |
| POST | `/api/estimate` | 估价：中位价 × 档位系数 ±10% 区间，输出 `basis[]` 逐项解释 |

## 实测结果

- 五个 API 全部返回 200；`/api/prices/not-exist` 正确返回 404
- `/api/verify` 用真实照片实测 **200**：识别出 `iphone-13-128g` / 8成新 / 后盖有刮痕 / 置信度 0.9；喂非法图会自动走 glm → qwen 双模型降级
- `/api/estimate`（iPhone 13 / 95新）：样本中位价 ¥1186 × 0.85 → mid ¥1008，区间 ¥907 ~ ¥1109
- `next build` 通过（exit 0），5 个 API 均注册为动态路由

## 数据

`data/used_samples.json` 已含 **557 条真实闲鱼数据**（6 款 T1 机型），经 `scripts/import_used.py` 调用 qwen-plus 做五档成色归一后入库，字段与《全员必读》定义逐项一致。

> `models.json` / `knowledge.json` / `prices_current.json` / `prices_history.json` 未改动，保持 main 的空占位，等数据组经 PR 提交。

## 与其他分支的契约对齐

报告字段已对齐 `feat/ai-engine` 的契约：`verdict` / `verdict_reason` / `price_position` / `pros` / `cons` / `pitfalls` / `sources` / `metrics` / `rule` / `rule_text`。买入判定线一致：二手 95 新中位价 ≤ 新机价 80% → `buy`。

已实测：注入 E 分支的数据后运行本后端，`/api/prices/mate-60-pro` 命中 119 条样本、`/api/estimate` 正常出区间、E 生成的报告可被 `GET /api/report/[model]` 正确透传。

## 已知偏差

`next` 由任务书的 `14.2.35` 降至 **`14.2.33`**：`@next/swc-win32-x64-msvc@14.2.35` 在 npm 上不存在（该包最高版本为 14.2.33），属上游发布缺失。仍为 Next.js 14+，符合技术栈约束。

详见 `HANDOFF-C.md`。
