// scripts/smoke_test.mjs —— 队员C 五个 API 冒烟测试（仅本地 dev 用）
const BASE = "http://localhost:3000";

async function get(path) {
  const r = await fetch(BASE + path);
  const t = await r.text();
  let j = null;
  try { j = JSON.parse(t); } catch {}
  return { status: r.status, json: j, raw: t.slice(0, 300) };
}

async function post(path, body) {
  const r = await fetch(BASE + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const t = await r.text();
  let j = null;
  try { j = JSON.parse(t); } catch {}
  return { status: r.status, json: j, raw: t.slice(0, 300) };
}

// 1x1 透明 PNG，仅用于验证 /api/verify 路由 + AI 通道是否可达
const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const image = `data:image/png;base64,${PNG_B64}`;

const results = {};
results["GET /api/models"] = await get("/api/models");
results["GET /api/models?tier=1"] = await get("/api/models?tier=1");
results["GET /api/models?brand=Apple"] = await get("/api/models?brand=Apple");
results["GET /api/prices/iphone-13-128g"] = await get("/api/prices/iphone-13-128g");
results["GET /api/prices/not-exist"] = await get("/api/prices/not-exist");
results["POST /api/estimate"] = await post("/api/estimate", {
  model_id: "iphone-13-128g",
  grade: "95新",
  answers: { repaired: false, water: false, box: true },
});
results["POST /api/report/iphone-13-128g"] = await post("/api/report/iphone-13-128g", {});
results["POST /api/verify (1x1 png)"] = await post("/api/verify", { image });

for (const [k, v] of Object.entries(results)) {
  console.log(`\n### ${k} → HTTP ${v.status}`);
  console.log(JSON.stringify(v.json ?? v.raw, null, 2));
}
