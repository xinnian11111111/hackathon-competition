// GET  /api/report/[model]  → 读缓存，没有则 404
// POST /api/report/[model]  → 用 qwen-plus 生成报告（E 契约：verdict/verdict_reason/price_position/pros/cons/pitfalls/sources/metrics），写 reports/
// 报告契约与 E（AI 工程）保持一致，避免覆盖 E 的 20 份报告后前端渲染错位。
import { NextResponse } from "next/server";
import { aiChat, parseJsonLoose } from "@/lib/ai";
import {
  readJson,
  writeJson,
  PATHS,
  type Model,
  type Knowledge,
  type UsedSample,
  type PriceCurrent,
  type PriceHistoryPoint,
} from "@/lib/data";
import { medianPrice } from "@/lib/estimate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(_req: Request, ctx: { params: { model: string } }) {
  const id = ctx.params.model;
  try {
    const cached = readJson(PATHS.report(id));
    return NextResponse.json({ cached: true, report: cached });
  } catch {
    return NextResponse.json({ cached: false, error: "no cache" }, { status: 404 });
  }
}

export async function POST(_req: Request, ctx: { params: { model: string } }) {
  const id = ctx.params.model;

  const models = readJson<Model[]>(PATHS.models, []);
  const model = models.find((m) => m.id === id);
  if (!model) {
    return NextResponse.json({ error: `model not found: ${id}` }, { status: 404 });
  }

  const current = readJson<Record<string, PriceCurrent>>(PATHS.pricesCurrent, {});
  const history = readJson<Record<string, PriceHistoryPoint[]>>(PATHS.pricesHistory, {});
  const used = readJson<UsedSample[]>(PATHS.usedSamples, []);
  const knowledge = readJson<Knowledge[]>(PATHS.knowledge, []);

  const cur = current[id];
  const currentPrice = cur?.jd ?? null;
  const hist = history[id] ?? [];
  const usedOf = used.filter((u) => u.model_id === id);
  const used95 = usedOf.filter((u) => u.grade === "95新").map((u) => ({ price: u.price }));
  const used95Median = medianPrice(used95);
  const usedSampleCount = usedOf.length;
  const launchPrice = model.launch_price;
  const used95Ratio =
    used95Median > 0 && launchPrice > 0 ? (used95Median / launchPrice) * 100 : null;

  // 近30天价格百分位
  let percentile30d: number | null = null;
  if (currentPrice != null && hist.length) {
    const sorted = hist.map((h) => h.price).sort((a, b) => a - b);
    const below = sorted.filter((p) => p <= currentPrice).length;
    percentile30d = Math.round((below / sorted.length) * 100);
  }
  // 近7天涨跌
  let weekChange: number | null = null;
  if (hist.length >= 7) {
    const recent = hist.slice(-7);
    const f = recent[0].price;
    const l = recent[recent.length - 1].price;
    weekChange = f > 0 ? Math.round(((l - f) / f) * 1000) / 10 : null;
  }

  // 规则判定（与 E 的买入线一致：二手95新中位价 ≤ 新机价 80% → buy）
  let rule = 0;
  let verdict: "buy" | "caution" | "avoid" = "caution";
  let ruleText = "";
  if (used95Ratio != null) {
    if (used95Ratio <= 80) {
      rule = 2;
      verdict = "buy";
      ruleText = `二手95新中位价为新机价的 ${used95Ratio.toFixed(1)}%（≤80%，买入线）`;
    } else if (used95Ratio <= 95) {
      rule = 1;
      verdict = "caution";
      ruleText = `二手95新中位价为新机价的 ${used95Ratio.toFixed(1)}%（80%~95%，观望）`;
    } else {
      rule = 0;
      verdict = "avoid";
      ruleText = `二手95新中位价为新机价的 ${used95Ratio.toFixed(1)}%（>95%，不推荐）`;
    }
  }

  const knownIssues = knowledge
    .filter((k) => k.content.includes(model.name) || k.title.includes(model.name))
    .slice(0, 5)
    .map((k) => `- ${k.title}: ${k.content}`)
    .join("\n");

  const prompt = `你是数码评测编辑。基于以下真实数据，为这款手机写一份「值不值得买」决策报告。

机型：${model.brand} ${model.name} ${model.variant}
首发价：¥${launchPrice}
当前京东价：¥${currentPrice ?? "（无数据）"}
近30天价格百分位：第${percentile30d ?? "无"}百分位（越低越接近最低价）
近7天涨跌：${weekChange != null ? weekChange + "%" : "无数据"}
二手95新中位价：¥${used95Median || "（无数据）"}
二手95新/新机价比例：${used95Ratio != null ? used95Ratio.toFixed(1) + "%" : "无数据"}
二手在售样本数：${usedSampleCount}
初步买入建议：${verdict}（规则：${ruleText}）

可参考的避坑知识：
${knownIssues || "（暂无）"}

请输出 JSON（只输出 JSON，不要多余文字）：
{
  "verdict_reason": "一句话说明当前是否值得买及核心理由（含价格判断）",
  "price_position": "对当前价位的判断，如『当前价X元，处于近30天第N百分位』",
  "pros": ["优点1", "优点2", "优点3"],
  "cons": ["缺点1", "缺点2"],
  "pitfalls": ["基于避坑知识的选购/验机提示1", "提示2"],
  "sources": [{"title": "京东搜索页", "url": "${model.jd_url ?? ""}"}]
}`;

  const r = await aiChat([{ role: "user", content: prompt }]);
  if ("error" in r) {
    return NextResponse.json({ error: r.error }, { status: 502 });
  }
  const parsed = parseJsonLoose(r.text) as Record<string, unknown>;
  if (!parsed || typeof parsed !== "object") {
    return NextResponse.json(
      { error: "AI 输出非 JSON", raw: r.text.slice(0, 500) },
      { status: 502 }
    );
  }

  const report = {
    verdict,
    verdict_reason: parsed["verdict_reason"] ?? "",
    price_position: parsed["price_position"] ?? "",
    pros: Array.isArray(parsed["pros"]) ? (parsed["pros"] as string[]) : [],
    cons: Array.isArray(parsed["cons"]) ? (parsed["cons"] as string[]) : [],
    pitfalls: Array.isArray(parsed["pitfalls"]) ? (parsed["pitfalls"] as string[]) : [],
    sources: Array.isArray(parsed["sources"])
      ? (parsed["sources"] as { title: string; url: string }[])
      : [{ title: "京东搜索页", url: model.jd_url ?? "" }],
    model_id: id,
    model_title: `${model.brand} ${model.name} ${model.variant}`,
    generated_at: new Date().toISOString(),
    generator: r.model ?? "qwen-plus",
    models_source: "models.json",
    rule,
    rule_text: ruleText,
    metrics: {
      current_price: currentPrice,
      percentile_30d: percentile30d,
      used_95_median: used95Median || null,
      used_95_ratio_pct: used95Ratio != null ? Math.round(used95Ratio * 10) / 10 : null,
      week_change_pct: weekChange,
      used_sample_count: usedSampleCount,
    },
  };

  writeJson(PATHS.report(id), report);
  return NextResponse.json({ cached: false, model_used: r.model, report });
}
