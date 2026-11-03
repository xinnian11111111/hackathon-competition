// POST /api/estimate
// 入参：{ model_id, grade, answers:{screen_scratches,frame_dents,repaired,water,box} }
// 返回：{ low, mid, high, basis[] }
import { NextRequest, NextResponse } from "next/server";
import { estimate, medianPrice, type EstimateInput } from "@/lib/estimate";
import { readJson, PATHS, type UsedSample } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: EstimateInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const { model_id, grade, answers } = body || ({} as EstimateInput);
  if (!model_id || !grade) {
    return NextResponse.json({ error: "missing model_id or grade" }, { status: 400 });
  }

  const used = readJson<UsedSample[]>(PATHS.usedSamples, []);
  const usedOf = used.filter((u) => u.model_id === model_id);
  const baseMid = medianPrice(usedOf);

  if (baseMid <= 0) {
    return NextResponse.json(
      { error: `no used samples for ${model_id}, cannot estimate` },
      { status: 400 }
    );
  }

  try {
    const result = estimate({ model_id, grade, answers: answers ?? {} }, baseMid);
    return NextResponse.json({
      ...result,
      sample_count: usedOf.length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 400 });
  }
}
