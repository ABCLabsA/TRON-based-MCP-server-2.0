function assertPositiveNumber(value, name) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${name} must be a number > 0`);
  }
  return n;
}

function assertFeeBps(value) {
  if (value === undefined || value === null) return 0;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 5000) {
    throw new Error("feeBps must be in [0, 5000]");
  }
  return n;
}

function normalizeCurve(curve) {
  if (!curve || typeof curve !== "object") {
    throw new Error("curve is required");
  }
  return {
    virtualBase: assertPositiveNumber(curve.virtualBase, "curve.virtualBase"),
    virtualToken: assertPositiveNumber(curve.virtualToken, "curve.virtualToken"),
    feeBps: assertFeeBps(curve.feeBps)
  };
}

function feeAdjustedIn(amountIn, feeBps) {
  return amountIn * (1 - feeBps / 10000);
}

export function spotPrice(curve) {
  const c = normalizeCurve(curve);
  return c.virtualBase / c.virtualToken;
}

export function quoteBuy(curve, amountBaseIn) {
  const c = normalizeCurve(curve);
  const amountIn = assertPositiveNumber(amountBaseIn, "amountIn");
  const amountInAfterFee = feeAdjustedIn(amountIn, c.feeBps);
  const k = c.virtualBase * c.virtualToken;
  const nextBase = c.virtualBase + amountInAfterFee;
  const nextToken = k / nextBase;
  const amountOut = c.virtualToken - nextToken;
  const spotPriceBefore = c.virtualBase / c.virtualToken;
  const spotPriceAfter = nextBase / nextToken;
  const avgPrice = amountIn / amountOut;
  const priceImpactPct = ((spotPriceAfter - spotPriceBefore) / spotPriceBefore) * 100;
  return {
    side: "buy",
    amountIn,
    amountOut,
    avgPrice,
    spotPriceBefore,
    spotPriceAfter,
    priceImpactPct,
    nextCurve: {
      virtualBase: nextBase,
      virtualToken: nextToken,
      feeBps: c.feeBps
    }
  };
}

export function quoteSell(curve, amountTokenIn) {
  const c = normalizeCurve(curve);
  const amountIn = assertPositiveNumber(amountTokenIn, "amountIn");
  const amountInAfterFee = feeAdjustedIn(amountIn, c.feeBps);
  const k = c.virtualBase * c.virtualToken;
  const nextToken = c.virtualToken + amountInAfterFee;
  const nextBase = k / nextToken;
  const amountOut = c.virtualBase - nextBase;
  const spotPriceBefore = c.virtualBase / c.virtualToken;
  const spotPriceAfter = nextBase / nextToken;
  const avgPrice = amountOut / amountIn;
  const priceImpactPct = ((spotPriceAfter - spotPriceBefore) / spotPriceBefore) * 100;
  return {
    side: "sell",
    amountIn,
    amountOut,
    avgPrice,
    spotPriceBefore,
    spotPriceAfter,
    priceImpactPct,
    nextCurve: {
      virtualBase: nextBase,
      virtualToken: nextToken,
      feeBps: c.feeBps
    }
  };
}

export function quoteBySide(curve, side, amountIn) {
  if (side === "buy") return quoteBuy(curve, amountIn);
  if (side === "sell") return quoteSell(curve, amountIn);
  throw new Error("side must be 'buy' or 'sell'");
}

export function splitPlan(curve, side, totalAmountIn, parts) {
  const c = normalizeCurve(curve);
  const total = assertPositiveNumber(totalAmountIn, "totalAmountIn");
  const p = Number(parts);
  if (!Number.isInteger(p) || p < 2 || p > 50) {
    throw new Error("parts must be an integer in [2, 50]");
  }

  const single = quoteBySide(c, side, total);
  const stepAmount = total / p;
  const plan = [];
  let runningCurve = c;
  let totalOut = 0;
  let impactAbsSum = 0;

  for (let i = 0; i < p; i += 1) {
    const q = quoteBySide(runningCurve, side, stepAmount);
    totalOut += q.amountOut;
    impactAbsSum += Math.abs(q.priceImpactPct);
    plan.push({
      index: i + 1,
      amountIn: stepAmount,
      expectedOut: q.amountOut,
      expectedImpactPct: q.priceImpactPct
    });
    runningCurve = q.nextCurve;
  }

  return {
    single,
    plan,
    splitTotalOut: totalOut,
    splitAvgImpactPct: impactAbsSum / p
  };
}
