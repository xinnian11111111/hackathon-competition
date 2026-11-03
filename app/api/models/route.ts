// GET /api/models?tier=1&brand=Apple
// 列出机型目录，支持 tier 与 brand 过滤
import { NextRequest, NextResponse } from "next/server";
import { readJson, PATHS, type Model } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const tier = req.nextUrl.searchParams.get("tier");
  const brand = req.nextUrl.searchParams.get("brand");

  let models: Model[];
  try {
    models = readJson<Model[]>(PATHS.models, []);
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }

  if (tier) {
    const t = Number(tier);
    if (Number.isFinite(t)) models = models.filter((m) => m.tier === t);
  }
  if (brand) {
    const b = brand.toLowerCase();
    models = models.filter((m) => m.brand.toLowerCase() === b);
  }

  return NextResponse.json({ count: models.length, items: models });
}
