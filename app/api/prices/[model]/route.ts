// GET /api/prices/[model]
// 聚合：current（京东现价）+ history（30天）+ used（二手中位价）
import { NextResponse } from "next/server";
import {
  readJson,
  PATHS,
  type PriceCurrent,
  type PriceHistoryPoint,
  type UsedSample,
  type Model,
} from "@/lib/data";
import { medianPrice } from "@/lib/estimate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: { model: string } }) {
  const modelId = ctx.params.model;

  const models = readJson<Model[]>(PATHS.models, []);
  const model = models.find((m) => m.id === modelId);
  if (!model) {
    return NextResponse.json({ error: `model not found: ${modelId}` }, { status: 404 });
  }

  const current = readJson<Record<string, PriceCurrent>>(PATHS.pricesCurrent, {});
  const history = readJson<Record<string, PriceHistoryPoint[]>>(PATHS.pricesHistory, {});
  const used = readJson<UsedSample[]>(PATHS.usedSamples, []);

  const usedOf = used.filter((u) => u.model_id === modelId);
  const usedMid = medianPrice(usedOf);

  return NextResponse.json({
    model_id: modelId,
    model,
    current: current[modelId] ?? null,
    history: history[modelId] ?? [],
    used: {
      count: usedOf.length,
      median: usedMid,
      samples: usedOf.slice(0, 20), // 只回前 20 条样本，避免响应过大
    },
  });
}
