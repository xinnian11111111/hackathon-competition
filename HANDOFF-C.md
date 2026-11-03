# 队员 C 交接文档（泳道2 后端 · 分支 feat-api-core）

> 交接对象：队员 D（接棒联调）、队员 E（AI 工程，契约对齐）、队长（合并决策）
> 状态：第一棒完成。**五个 API 全通、真实照片 verify 实测 200、生产 build 通过（exit 0）、557 条真实二手数据已入库、与 E 的报告契约冲突已解决。**

## 一、已交付 API（本地 dev 全部实测）

| 方法 | 路径 | 说明 | 实测 |
|------|------|------|------|
| GET | `/api/models?tier=&brand=` | 机型目录，支持 tier/brand 过滤 | ✅ 200 |
| GET | `/api/prices/[model]` | 聚合 current + history + used 中位价 | ✅ 200（iphone-13 used 中位价 ¥1186，30 样本） |
| POST | `/api/verify` | 收 base64 图 → 识机/评成色 → JSON（glm-4v-flash 主，失败自动切 qwen3-vl-plus） | ✅ **真实照片 200**：识别出 iphone-13-128g / 8成新 / 后盖刮痕 / 置信度0.9 |
| GET/POST | `/api/report/[model]` | 读缓存 / qwen-plus 生成报告写 `reports/` | ✅ 200（**已改为 E 契约**，见 §五） |
| POST | `/api/estimate` | 估价引擎：中位价×系数±10% | ✅ 200（1186×0.85=mid ¥1008，区间 ¥907~1109） |

异常路径也已验证：`/api/prices/not-exist` → 404；`/api/verify` 喂 1×1 非法图 → 502 且自动走了 glm→qwen 双模型降级（证明降级链路通）。

## 二、关键文件（仅改泳道2目录）

- `lib/data.ts` —— JSON 原子读写（tmp+rename）+ 路径穿越防护 + 全部类型定义
- `lib/estimate.ts` —— 五档系数（99新0.92/95新0.85/9成新0.76/8成新0.65/大修0.5）+ 拆修(-8%)/进水(-15%)/无盒(-3%) 扣减，输出 basis[] 供答辩逐项讲解
- `app/api/{models,prices/[model],verify,report/[model],estimate}/route.ts` —— 全部 `runtime="nodejs"`
- `scripts/import_used.py` —— 二手 CSV → qwen-plus 批量归一成色（20 条/批）→ 合并 used_samples.json，失败落 failed.csv
- `scripts/smoke_test.mjs` —— 五 API 冒烟脚本（本地联调用）
- `data/used_samples.json` —— **557 条真实闲鱼数据**（来自 xianyu.zip，6 款 T1 机型）

## 三、真实二手数据入库结果（557 条）

| 机型 | 样本数 | 中位价 | 价格区间 | 五档分布 |
|------|--------|--------|----------|----------|
| iphone-13-128g | 30 | ¥1186 | 799~1388 | 99新4/95新22/9成新2/8成新1/大修1 |
| iphone-14-pro-256g | 60 | ¥2299 | 1750~2809 | 99新16/95新29/9成新9/8成新1/大修5 |
| huawei-mate60-pro | 119 | ¥1490 | 499~2499 | 99新27/95新63/9成新16/8成新7/大修6 |
| xiaomi-14 | 117 | ¥1289 | 960~1699 | 99新46/95新61/9成新6/8成新4 |
| redmi-k70 | 115 | ¥850 | 39~1098 | 99新36/95新56/9成新13/8成新4/大修6 |
| oneplus-ace3 | 116 | ¥1000 | 580~1950 | 99新19/95新45/9成新20/8成新16/大修16 |

（570 行原始，13 行因 (title,price) 重复被去重）

> **model_id 已对齐 E 的机型目录**：原始 CSV 里两款的 id 与 `data/models.json` 不一致（`huawei-mate60-pro` → `mate-60-pro`、`oneplus-ace3` → `oneplus-ace-3`），共 **235 条**已重映射。`import_used.py` 增加了 `MODEL_ALIAS` + `resolve_model_id()`，以后传错 id 会自动纠正并告警，不会静默写进库后失联。

## 四、数据边界（重要，给 E 和队长看）

任务书「目录即边界」原文：

> `data/*.json` → 数据文件（泳道2 **写读写代码**，数据内容由队长/数据组经 PR 提交）
> 任何数据**不得手改** data/ 下 JSON——唯一入口是入库脚本 + PR

据此，本分支对 `data/` 的处理如下：

| 文件 | 处理 | 理由 |
|------|------|------|
| `models.json`、`knowledge.json`、`prices_current.json`、`prices_history.json` | **已还原为 `origin/main` 版本（空占位）**，本分支 diff 为 0 | 属数据组/队长内容，C 只写读写代码。若合并我的 6 款 mock 会覆盖 E 的 20 款 |
| `used_samples.json` | **保留 557 条真实数据** | 泳道2 产出物第 8 条明确要求「输出 data/used_samples.json 追加」；必读数据分工也写明「闲鱼 CSV → import_used.py 成色归一入库」。这是 C 的交付物，不是越界 |
| `data/reports/<model>.json` | **删除我先前生成的 C 格式缓存** | 内容契约归 E/B，我只负责写入逻辑（泳道2 第 5 条要求运行时写该文件） |

**合并注意**：main 里这些数据文件目前都是空占位（`models.json` = `[]`），E 的 20 款在 `feat/ai-engine` 分支上。合并顺序上，**E 的数据应盖过我的空占位**；我的 `used_samples.json` 与 E 的 77 条 seed 是同一个文件，建议合并时**取并集或直接采用我的 557 条**（字段结构完全一致）。

## 五、报告契约对齐（已解决）

冲突起因：任务书对 `reports/<model_id>.json` 只写了「AI 预生成报告缓存」，**未定义字段**。我先按 `title/score/summary/price_comment` 生成，E 按 `verdict_reason/price_position/sources` 生成，两套契约会让 B 的报告页渲染不了。

处理：`POST /api/report/[model]` 已按 E 的契约重写，输出字段为

```
verdict / verdict_reason / price_position / pros / cons / pitfalls / sources
model_id / model_title / generated_at / generator / models_source / rule / rule_text
metrics { current_price, percentile_30d, used_95_median, used_95_ratio_pct, week_change_pct, used_sample_count }
```

买入判定线与 E 一致：二手95新中位价 ≤ 新机价 **80% → buy**；80%~95% → caution；>95% → avoid。
`GET` 为纯透传缓存，不校验字段，因此对 E 已生成的 20 份报告**完全兼容**。

## 六、合并验证实测（2026-11-03，E 的数据 + C 的 API）

把 E 分支（`81ee294`）的 `models/knowledge/prices_*` + 20 份报告临时注入，跑 C 的代码，结果全绿：

| 请求 | 结果 |
|------|------|
| `GET /api/models` | 200（读到 E 的 20 款目录） |
| `GET /api/prices/mate-60-pro` | 200，**used.count = 119**，median ¥1490（证明 model_id 重映射生效，235 条不再失联） |
| `POST /api/estimate`（mate-60-pro / 95新） | 200，low ¥1140 / mid ¥1267 / high ¥1394，basis 4 项 |
| `GET /api/report/mate-60-pro`（E 生成的缓存） | 200，`verdict=buy`、`verdict_reason` 有值、`pros=3`、`metrics` 存在 —— **C 的 GET 完全兼容 E 的报告格式** |
| `GET /api/prices/iphone-13-128g` | 200，used.count = 30，median ¥1186 |

结论：**数据层用 E 的、后端用 C 的，能直接跑通**，不需要改 E 的报告或数据。验证后数据已全部还原，分支里不留 E 的文件。

## 七、已知问题 / 注意

1. **Next.js 版本**：任务书写 14.2.35，但其 SWC 原生二进制（`@next/swc-win32-x64-msvc`）在 npm 上不存在（最高仅 14.2.33）。已统一降级到 **14.2.33**（仍属 Next.js 14+，符合技术栈约束）。若他人环境能装 14.2.35 可回滚，但本机装不了。
2. **import_used.py 鲁棒性**：qwen-plus 对长批次（>10 条）偶尔返回条数不符（如 20 行只给 19 个 grade）。已修复——批次失败自动**降级为逐行判定**，单行仍失败用**本地关键词规则**兜底（`heuristic_grade`），保证入库不中断。570 行全量约 8 分钟。
3. **二手样本多为"95新"**：卖家描述偏正面，中位价偏中高端。答辩时可说明这是「在售价」而非「成交价」。
4. **`.env.local` 含 key**：已 gitignore，切勿提交/截图。
5. **本机 git 环境限制（仅影响本机，不影响仓库）**：分支名不能带 `/`（`feat/api-core` 的 ref 写不进去，提交会变成 dangling），故用 `feat-api-core`；`git checkout <rev> -- <path>` 会误删整个 `data/`，改用 `git show` 直读对象库。
6. **`feat/ai-engine` 分支的构成需队长确认**：该分支（`81ee294`）除 `lib/ai.ts` 外，还包含 `app/api/**`（5 个路由，文件头自注"泳道2"）、`lib/data.ts`、`lib/estimate.ts`、`scripts/import_used.py`、`app/prices|verify|report/*/page.tsx`、`components/**`、20 款数据与 20 份报告。即 1A/1B/2/D 的目录都在其中。与 C 的分支合并时这 8 个文件是 **add/add 冲突**（两边各自新增了同名文件），需要二选一，不是简单的数据覆盖。

## 八、D 接手待办

- [ ] 联调前端（泳道1B 验机/报告页）——后端 API 已全部就绪
- [ ] 如需补全 T2 机型（12 款行情机）数据，用同样流程跑 `import_used.py`
- [ ] 若想要更真实的成色分布，可让 AI 用 `condition_text` 全文（而非仅 title）判定——需采集端补该列
- [ ] 真实照片再补 2 张（轻划痕/重损各一）POST `/api/verify` 验证五档边界
- [ ] 待 E 的 20 款 `models.json` 合入 main 后，重跑一次 `/api/report/[model]` 生成全量 20 份报告

## 九、协作约定

- 分支 `feat-api-core`，基于 `origin/main`（commit `4a03f3b`）之上，PR diff 只含本泳道改动（14 个文件）
- 任务书原文要求双推 + PR 开在 GitHub；当前本机 remote 仅指向 Gitee（`https://gitee.com/its-a-shame/hackathon-competition`），PR 先在 Gitee 侧开（base: main，head: feat-api-core），由队长同步到 GitHub
- main 受保护，走 PR，不直推
