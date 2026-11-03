// lib/data.ts —— 纯 JSON 文件存储（泳道2 维护）
// 原子写：tmp 文件 + rename，避免并发/中断时把 JSON 写坏。
// 注意：所有 data/*.json 都通过这里读写，禁止业务代码散落 fs 调用。

import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

const DATA_DIR = path.join(process.cwd(), "data");

function resolveDataPath(relPath: string): string {
  // 防止路径穿越：拒绝 .. 与绝对路径
  if (relPath.includes("..") || path.isAbsolute(relPath)) {
    throw new Error(`invalid data path: ${relPath}`);
  }
  return path.join(DATA_DIR, relPath);
}

export function readJson<T = unknown>(relPath: string, fallback?: T): T {
  const full = resolveDataPath(relPath);
  if (!fs.existsSync(full)) {
    if (arguments.length >= 2) return fallback as T;
    throw new Error(`data file not found: ${relPath}`);
  }
  const raw = fs.readFileSync(full, "utf-8");
  if (!raw.trim()) {
    if (arguments.length >= 2) return fallback as T;
    throw new Error(`data file empty: ${relPath}`);
  }
  return JSON.parse(raw) as T;
}

export function writeJson(relPath: string, value: unknown): void {
  const full = resolveDataPath(relPath);
  const dir = path.dirname(full);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(full)}.${randomBytes(6).toString("hex")}.tmp`);
  const body = JSON.stringify(value, null, 2);
  fs.writeFileSync(tmp, body, "utf-8");
  fs.renameSync(tmp, full); // 同分区 rename 原子
}

// 列出 data/reports/ 下的缓存文件名（不含扩展名），用于 GET /api/report 列表
export function listReportIds(): string[] {
  const dir = path.join(DATA_DIR, "reports");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));
}

// 类型定义：与 00-全员必读.md 对齐
export type Model = {
  id: string;
  brand: string;
  name: string;
  variant: string;
  tier: 1 | 2 | 3;
  launch_price: number;
  jd_url?: string;
  keywords_xianyu?: string;
};

export type PriceCurrent = {
  jd: number;
  captured_at: string;
  source: string;
};

export type PriceHistoryPoint = { date: string; price: number };

export type UsedSample = {
  platform: string;
  model_id: string;
  title: string;
  price: number;
  condition_text: string;
  grade: string; // 99新/95新/9成新/8成新/大修
  link?: string;
  captured_at: string;
};

export type Knowledge = {
  id: string;
  category: string;
  title: string;
  content: string;
  source?: string;
};

export const PATHS = {
  models: "models.json",
  pricesCurrent: "prices_current.json",
  pricesHistory: "prices_history.json",
  usedSamples: "used_samples.json",
  knowledge: "knowledge.json",
  report: (modelId: string) => `reports/${modelId}.json`,
} as const;
