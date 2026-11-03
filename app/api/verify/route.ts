// POST /api/verify
// 入参：{ image: "data:image/jpeg;base64,..." } 或纯 base64
// 流程：lib/ai.aiVision(glm-4v-flash) → 失败自动切 qwen3-vl-plus（在 ai.ts 内部）
// 返回结构化 JSON：{ model_id, model_name, grade, defects[], confidence }
import { NextRequest, NextResponse } from "next/server";
import { aiVision, parseJsonLoose } from "@/lib/ai";
import { readJson, PATHS, type Model } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PROMPT = `你是手机验机专家。请从这张照片中识别：
1) 机型（在下方机型目录里选最匹配的一个 model_id；如果都不像，model_id 填 null）
2) 成色档位（五档：99新 / 95新 / 9成新 / 8成新 / 大修）
3) 瑕疵列表（如：屏幕划痕 / 边框磕碰 / 后盖碎裂 / 摄像头进灰 / 屏幕坏点 等）
4) 置信度 0~1

只输出 JSON，不要任何多余文字。格式：
{
  "model_id": "iphone-13-128g 或 null",
  "model_name": "iPhone 13 128G",
  "grade": "95新",
  "defects": ["屏幕轻微划痕"],
  "confidence": 0.85
}

机型目录：`;

export async function POST(req: NextRequest) {
  let body: { image?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }
  const image = body?.image;
  if (!image || typeof image !== "string" || image.length < 64) {
    return NextResponse.json(
      { error: "missing field: image (data:image/...;base64,xxx)" },
      { status: 400 }
    );
  }

  // 把机型目录喂给模型，提高识别命中率
  const models = readJson<Model[]>(PATHS.models, []);
  const catalog = models
    .map((m) => `- ${m.id} = ${m.brand} ${m.name} ${m.variant}`)
    .join("\n");
  const prompt = `${PROMPT}\n${catalog || "（目录为空，请尽力识别）"}`;

  const r = await aiVision(image, prompt);
  if ("error" in r) {
    return NextResponse.json({ error: r.error }, { status: 502 });
  }

  const parsed = parseJsonLoose(r.text);
  if (!parsed) {
    return NextResponse.json(
      { error: "AI 输出非 JSON", raw: r.text.slice(0, 500) },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    model_used: r.model,
    result: parsed,
  });
}
