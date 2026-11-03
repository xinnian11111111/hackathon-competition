# PR 提交材料（复制粘贴用）

## 一、新建 PR 的链接（点开即预填分支）

```
https://gitee.com/its-a-shame/hackathon-competition/pulls/new?head=feat-api-core&base=main
```

打开后确认页面显示 **`main ← feat-api-core`**，然后填下面两项，点「创建」。

---

## 二、PR 标题

```
队员C 泳道2 后端：五 API + 估价引擎 + 二手入库（557 条真实数据）
```

---

## 三、PR 描述（整段复制）

```markdown
## 本次交付

泳道2 后端全部完成，仅改动本泳道目录：`lib/data.ts`、`lib/estimate.ts`、`app/api/**`、`scripts/**`。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/models` | 机型目录，支持 `?tier=1&brand=Apple` |
| GET | `/api/prices/[model]` | 聚合 current + history + used 中位价 |
| POST | `/api/verify` | 照片验机，glm-4v-flash 主、qwen3-vl-plus 备 |
| GET/POST | `/api/report/[model]` | 读缓存 / 生成报告 |
| POST | `/api/estimate` | 估价：中位价 × 系数 ±10%，输出 `basis[]` |

## 实测结果

- 五个 API 全部返回 200；`/api/prices/not-exist` 正确 404
- `/api/verify` 用真实照片实测 **200**：识别出 `iphone-13-128g / 8成新 / 后盖刮痕 / 置信度 0.9`；非法图自动走 glm→qwen 双模型降级
- `/api/estimate`（iPhone 13 / 95新）：中位价 ¥1186 × 0.85 → mid ¥1008，区间 ¥907~1109
- `next build` 通过（exit 0），5 个 API 均注册为动态路由

## 数据

`data/used_samples.json` 已含 **557 条真实闲鱼数据**（6 款 T1 机型），经 `scripts/import_used.py` 走 qwen-plus 五档成色归一入库，字段与《全员必读》定义逐项一致。

> `models.json` / `knowledge.json` / `prices_*` 未改动，保持 main 空占位，由数据组经 PR 提交。

## 与其他分支的关系

报告字段已对齐 `feat/ai-engine` 的契约（`verdict` / `verdict_reason` / `price_position` / `pros` / `cons` / `pitfalls` / `sources` / `metrics` / `rule`），买入线一致：二手95新中位价 ≤ 新机价 80% → `buy`。

已实测：注入 E 分支的数据后运行本后端，`/api/prices/mate-60-pro` 命中 119 条样本、`/api/estimate` 正常出区间、E 生成的报告可被 `GET /api/report/[model]` 正确透传。

## 需要队长裁决

`feat/ai-engine` 分支包含 9 个泳道2 文件（5 个 API 路由 + `lib/data.ts` + `lib/estimate.ts` + 2 个入库脚本），与本分支形成 9 个合并冲突，属两套后端二选一。详见 `反馈书-给队长.md`。

## 已知偏差

`next` 由任务书的 14.2.35 降至 **14.2.33**：`@next/swc-win32-x64-msvc@14.2.35` 在 npm 上不存在（该包最高 14.2.33），属上游发布缺失。仍为 Next.js 14+，符合技术栈约束。

详见 `HANDOFF-C.md`。
```

---

## 四、打开 PR 的完整步骤

1. 浏览器打开第一节的链接（**先确认右上角是你自己的 Gitee 账号**）
2. 确认分支方向是 `main ← feat-api-core`
3. 页面下方会列出改动文件清单 —— 应该**只有 14~16 个文件**，都在 `lib/`、`app/api/`、`scripts/`、`data/used_samples.json` 和几个 md 文档范围内
4. 标题填第二节那段
5. 描述框粘贴第三节整段
6. 点绿色「创建 Pull Request」

创建完不用点合并，等队长 review。

---

## 五、如果第 1 步打不开或提示 404

说明分支还没推上去。先在任何终端执行：

```
git push -u origin feat-api-core
```

或者告诉我，我用已缓存的 Gitee 凭据推送。
