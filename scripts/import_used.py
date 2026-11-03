#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
scripts/import_used.py —— 二手 CSV 入库（泳道2）

用法：
  python scripts/import_used.py path/to/xianyu.csv --model iphone-13-128g

CSV 列（油猴脚本导出）：
  platform, model_id, title, price, condition_text, link, captured_at

流程：
  1. 读 CSV
  2. 按 20 条/批 调 qwen-plus 把 condition_text 归一到五档（99新/95新/9成新/8成新/大修）
  3. 合并进 data/used_samples.json（去重：link 或 (title,price) 唯一）
  4. 失败行落 failed.csv
"""
import argparse
import csv
import json
import os
import sys
import time
from pathlib import Path

import urllib.request
import urllib.error

ROOT = Path(__file__).resolve().parent.parent
DATA_FILE = ROOT / "data" / "used_samples.json"
FAILED_FILE = ROOT / "data" / "failed.csv"
MODELS_FILE = ROOT / "data" / "models.json"

GRADES = ["99新", "95新", "9成新", "8成新", "大修"]
BATCH = 20

# 人工传参 / 历史 CSV 里常见的 model_id 变体 → data/models.json 的标准 id
# 统一在此收口，避免样本写进库后因 id 对不上机型目录而"静默失联"
MODEL_ALIAS = {
    "huawei-mate60-pro": "mate-60-pro",
    "huawei-mate-60-pro": "mate-60-pro",
    "oneplus-ace3": "oneplus-ace-3",
    "iphone13-128g": "iphone-13-128g",
    "iphone-14-pro-256": "iphone-14-pro-256g",
}


def resolve_model_id(raw: str) -> str:
    """把传入的 model_id 归一到机型目录里的标准 id，并给出提示"""
    mid = (raw or "").strip()
    if mid in MODEL_ALIAS:
        fixed = MODEL_ALIAS[mid]
        print(f"[warn] model_id '{mid}' 非标准，已映射为 '{fixed}'", file=sys.stderr)
        return fixed
    try:
        models = json.loads(MODELS_FILE.read_text(encoding="utf-8"))
        if isinstance(models, list) and models:
            ids = {m.get("id") for m in models}
            if mid not in ids:
                print(
                    f"[warn] model_id '{mid}' 不在 data/models.json 的 {len(ids)} 款目录中，样本将无法被 API 命中，请核对拼写",
                    file=sys.stderr,
                )
    except Exception:
        pass  # models.json 缺失/为空时不做校验
    return mid

DASHSCOPE_KEY = os.environ.get("DASHSCOPE_KEY", "")
QWEN_BASE = os.environ.get(
    "DASHSCOPE_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1"
)


def qwen_chat(prompt: str, model: str = "qwen-plus", retries: int = 2) -> str:
    """最小 OpenAI 兼容客户端，仅用于入库脚本（不进生产代码）"""
    if not DASHSCOPE_KEY:
        raise RuntimeError("DASHSCOPE_KEY not set")
    body = json.dumps(
        {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.1,
            "response_format": {"type": "json_object"},
        }
    ).encode("utf-8")
    last_err = None
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(
                f"{QWEN_BASE}/chat/completions",
                data=body,
                headers={
                    "content-type": "application/json",
                    "authorization": f"Bearer {DASHSCOPE_KEY}",
                },
            )
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            return data["choices"][0]["message"]["content"]
        except (urllib.error.URLError, KeyError, json.JSONDecodeError) as e:
            last_err = e
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"qwen failed: {last_err}")


def _parse_grades(text: str) -> list[str]:
    # 容错剥 ```json 包裹
    if "```" in text:
        s = text.find("{")
        e = text.rfind("}")
        if s >= 0 and e > s:
            text = text[s : e + 1]
    return json.loads(text).get("grades", [])


def normalize_batch(rows: list[dict]) -> dict[int, str]:
    """返回 {行号: grade}；失败抛异常"""
    items = []
    for i, r in enumerate(rows):
        items.append(f"{i}. {r.get('condition_text','') or r.get('title','')}")
    prompt = (
        "你是二手手机成色判定专家。把下面每条描述归一到这五档之一："
        "99新（无使用痕迹）/ 95新（轻微使用痕，无划痕磕碰）/ "
        "9成新（明显轻划痕或小磕碰）/ 8成新（多处划痕磕碰）/ 大修（拆修/进水/功能缺陷）。\n"
        "只输出 JSON：{\"grades\":[\"95新\",\"9成新\",...]}，长度必须与输入条数一致。\n\n"
        + "\n".join(items)
    )
    text = qwen_chat(prompt)
    grades = _parse_grades(text)
    if len(grades) != len(rows):
        raise RuntimeError(f"grades len {len(grades)} != rows {len(rows)}")
    out = {}
    for i, g in enumerate(grades):
        out[i] = g if g in GRADES else "9成新"
    return out


def normalize_single(text_body: str) -> str:
    """单行成色判定（批量失败时的降级路径）"""
    prompt = (
        "把这条二手手机描述归一到五档之一：99新/95新/9成新/8成新/大修。"
        "只输出 JSON：{\"grades\":[\"<档位>\"]}，长度恰好为 1。\n\n"
        + text_body
    )
    grades = _parse_grades(qwen_chat(prompt))
    g = grades[0] if grades else "9成新"
    return g if g in GRADES else "9成新"


def heuristic_grade(text_body: str) -> str:
    """本地关键词规则兜底（AI 不可用时用，保证入库不中断）"""
    t = text_body or ""
    if any(k in t for k in ["大修", "进水", "换屏", "换过屏", "维修", "拆修", "主板修", "扩容", "组装", "卡贴", "无面容", "不读卡", "漏液", "坏"]):
        return "大修"
    if any(k in t for k in ["99新", "充新", "全新", "仅激活", "未使用", "无暇"]):
        return "99新"
    if any(k in t for k in ["95新", "几乎", "轻微使用", "无划痕", "无磕碰", "带壳"]):
        return "95新"
    if any(k in t for k in ["9成新", "九成新", "轻划痕", "小磕碰", "小花"]):
        return "9成新"
    if any(k in t for k in ["8成新", "八成新", "多处", "明显划痕", "磕碰较多", "战损"]):
        return "8成新"
    return "9成新"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("csv", help="input CSV from tampermonkey")
    ap.add_argument("--model", required=True, help="model_id, e.g. iphone-13-128g")
    ap.add_argument("--platform", default="xianyu")
    args = ap.parse_args()
    model_id = resolve_model_id(args.model)

    csv_path = Path(args.csv)
    if not csv_path.exists():
        print(f"not found: {csv_path}", file=sys.stderr)
        return 1

    with csv_path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        rows = [r for r in reader]

    if not rows:
        print("empty csv")
        return 0

    print(f"loaded {len(rows)} rows from {csv_path.name}")

    # 已存在样本（去重用）
    existing: list[dict] = []
    if DATA_FILE.exists():
        existing = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    seen_links = {s.get("link") for s in existing if s.get("link")}
    seen_keys = {(s.get("title"), s.get("price")) for s in existing}

    out: list[dict] = []
    failed: list[dict] = []

    for i in range(0, len(rows), BATCH):
        chunk = rows[i : i + BATCH]
        grades: dict[int, str] | None = None
        try:
            grades = normalize_batch(chunk)
        except Exception as e:
            # 批量失败（多为模型计数不稳）→ 降级逐行判定，避免整批丢失
            print(f"[batch {i//BATCH}] batch FAILED ({e}); fallback to per-row", file=sys.stderr)
            grades = {}
            for idx, r in enumerate(chunk):
                body = (r.get("condition_text") or r.get("title") or "").strip()
                try:
                    grades[idx] = normalize_single(body)
                except Exception as e2:
                    print(f"  [row {i+idx}] single FAILED ({e2}); heuristic", file=sys.stderr)
                    grades[idx] = heuristic_grade(body)

        for idx, r in enumerate(chunk):
            link = (r.get("link") or "").strip()
            title = (r.get("title") or "").strip()
            try:
                price = float(str(r.get("price", "0")).replace(",", "").strip() or 0)
            except ValueError:
                price = 0
            if price <= 0:
                failed.append(r)
                continue
            if link and link in seen_links:
                continue
            if (title, int(price)) in seen_keys:
                continue

            sample = {
                "platform": r.get("platform") or args.platform,
                "model_id": model_id,
                "title": title,
                "price": int(price),
                "condition_text": (r.get("condition_text") or "").strip(),
                "grade": grades.get(idx, "9成新"),
                "link": link,
                "captured_at": r.get("captured_at")
                or time.strftime("%Y-%m-%dT%H:%M:%S%z"),
            }
            out.append(sample)
            if link:
                seen_links.add(link)
            seen_keys.add((title, int(price)))
        print(f"[batch {i//BATCH}] ok, +{len(out)} total")

    if out:
        existing.extend(out)
        DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
        tmp = DATA_FILE.with_suffix(".json.tmp")
        tmp.write_text(
            json.dumps(existing, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        tmp.replace(DATA_FILE)
        print(f"✓ appended {len(out)} samples → {DATA_FILE}")

    if failed:
        new_file = not FAILED_FILE.exists()
        with FAILED_FILE.open("a", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(failed[0].keys()))
            if new_file:
                w.writeheader()
            for r in failed:
                w.writerow(r)
        print(f"✗ {len(failed)} failed rows → {FAILED_FILE}", file=sys.stderr)

    return 0


if __name__ == "__main__":
    sys.exit(main())
