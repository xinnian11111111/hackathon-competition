// lib/estimate.ts —— 二手估价引擎（泳道2）
// 输入：机型 + 五档成色 + 答卷（拆修/进水/盒子/划痕/磕碰）
// 输出：low / mid / high + basis[]（逐项解释加减价，答辩要讲）
//
// 规则（来自任务书）：
//   基础系数：99新 0.92 / 95新 0.85 / 9成新 0.76 / 8成新 0.65 / 大修 0.5
//   额外扣减：拆修 -8%、进水 -15%、无盒 -3%
//   划痕/磕碰体现在成色档位里，不重复扣减
//   区间：±10% 作为议价空间

export type Grade = "99新" | "95新" | "9成新" | "8成新" | "大修";

export type EstimateAnswers = {
  screen_scratches?: boolean; // 屏幕明显划痕（已计入档位，仅记录）
  frame_dents?: boolean; // 边框磕碰（已计入档位，仅记录）
  repaired?: boolean; // 拆修过 → -8%
  water?: boolean; // 进水 → -15%
  box?: boolean; // 有原盒 → 不扣；无盒 -3%
};

export type EstimateInput = {
  model_id: string;
  grade: Grade;
  answers?: EstimateAnswers;
};

export type EstimateResult = {
  model_id: string;
  grade: Grade;
  base_mid: number; // 二手中位价（来自 used_samples.json）
  coefficient: number; // 总系数 = 档位系数 × (1 - 各项扣减)
  low: number;
  mid: number;
  high: number;
  basis: string[]; // 答辩用：逐项解释
};

// 档位基础系数
const GRADE_COEF: Record<Grade, number> = {
  "99新": 0.92,
  "95新": 0.85,
  "9成新": 0.76,
  "8成新": 0.65,
  大修: 0.5,
};

export function estimate(input: EstimateInput, baseMidPrice: number): EstimateResult {
  const { model_id, grade, answers = {} } = input;
  if (!(grade in GRADE_COEF)) {
    throw new Error(`unknown grade: ${grade}`);
  }
  if (!Number.isFinite(baseMidPrice) || baseMidPrice <= 0) {
    throw new Error(`invalid base mid price: ${baseMidPrice}`);
  }

  const basis: string[] = [];
  basis.push(`二手在售价中位数 ¥${baseMidPrice.toFixed(0)}（来源：used_samples.json）`);

  // 1) 档位基础系数
  let coef = GRADE_COEF[grade];
  basis.push(`成色 ${grade}：×${GRADE_COEF[grade]}（五档基础系数）`);

  // 2) 额外扣减项（叠乘）
  if (answers.repaired) {
    coef *= 1 - 0.08;
    basis.push("有拆修记录：×0.92（-8%）");
  }
  if (answers.water) {
    coef *= 1 - 0.15;
    basis.push("进水史：×0.85（-15%）");
  }
  if (answers.box === false) {
    coef *= 1 - 0.03;
    basis.push("无原盒：×0.97（-3%）");
  } else if (answers.box === true) {
    basis.push("有原盒配件：不扣减");
  }

  if (answers.screen_scratches || answers.frame_dents) {
    basis.push("屏幕/边框痕迹已计入成色档位，不重复扣减");
  }

  const mid = Math.round(baseMidPrice * coef);
  const low = Math.round(mid * 0.9);
  const high = Math.round(mid * 1.1);
  basis.push(`议价区间 ±10%：¥${low} ~ ¥${high}`);

  return {
    model_id,
    grade,
    base_mid: Math.round(baseMidPrice),
    coefficient: Number(coef.toFixed(4)),
    low,
    mid,
    high,
    basis,
  };
}

// 计算二手中位价（输入已按 model_id 过滤好的样本数组）
export function medianPrice(samples: Array<{ price: number }>): number {
  if (samples.length === 0) return 0;
  const arr = samples.map((s) => s.price).filter((n) => Number.isFinite(n) && n > 0);
  if (arr.length === 0) return 0;
  arr.sort((a, b) => a - b);
  const m = arr.length >> 1;
  return arr.length % 2 ? arr[m] : (arr[m - 1] + arr[m]) / 2;
}
