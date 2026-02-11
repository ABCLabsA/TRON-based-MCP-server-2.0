import "dotenv/config";
import http from "node:http";
import crypto from "node:crypto";
import { getTransactionInfo } from "./providers/tronscan.js";
import {
  createTransferTransaction,
  getAccount,
  getAccountTransactions,
  getChainParameters,
  getNowBlock,
  getTrc20Balance,
  toHexAddress,
} from "./providers/trongrid.js";
import { quoteBySide, splitPlan as buildSplitPlan } from "./robinpump/curve.js";
import { startMcpServer } from "./mcp.js";

const DEFAULT_HTTP_PORT = 8787;
const PORT = Number(process.env.PORT || DEFAULT_HTTP_PORT);
const MCP_HTTP_PORT = Number(process.env.MCP_HTTP_PORT || PORT);
const USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const SERVER_INFO = { name: "tron-mcp-server", version: "0.1.0" };
const RP_PRESETS = {
  A: { virtualBase: 100000, virtualToken: 500000, feeBps: 30 },
  B: { virtualBase: 250000, virtualToken: 350000, feeBps: 50 },
};

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(data),
    "Access-Control-Allow-Origin": process.env.CORS_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  });
  res.end(data);
}

function toMcpToolResult(body) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(body, null, 2),
      },
    ],
    isError: body?.ok === false,
  };
}

function sendJsonRpcResult(res, id, result) {
  return sendJson(res, 200, {
    jsonrpc: "2.0",
    id: id ?? null,
    result,
  });
}

function sendJsonRpcError(res, id, code, message, data = null) {
  return sendJson(res, 200, {
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code, message, data },
  });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) {
        reject(new Error("Body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

const TOOLS = [
  {
    name: "get_network_status",
    description: "Get TRON network status.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "get_usdt_balance",
    description: "Get USDT balance for an address.",
    inputSchema: {
      type: "object",
      properties: { address: { type: "string" } },
      required: ["address"],
      additionalProperties: false,
    },
  },
  {
    name: "get_tx_status",
    description: "Get transaction status by txid.",
    inputSchema: {
      type: "object",
      properties: { txid: { type: "string" } },
      required: ["txid"],
      additionalProperties: false,
    },
  },
  {
    name: "get_account_profile",
    description: "Advanced account profile with balances and recent activity.",
    inputSchema: {
      type: "object",
      properties: { address: { type: "string" } },
      required: ["address"],
      additionalProperties: false,
    },
  },
  {
    name: "rp_quote",
    description: "Bonding-curve quote for buy/sell simulation.",
    inputSchema: {
      type: "object",
      properties: {
        side: { type: "string", enum: ["buy", "sell"] },
        amountIn: { type: "number", exclusiveMinimum: 0 },
        curve: {
          type: "object",
          properties: {
            virtualBase: { type: "number" },
            virtualToken: { type: "number" },
            feeBps: { type: "number" },
          },
          required: ["virtualBase", "virtualToken"],
          additionalProperties: false,
        },
        preset: { type: "string", enum: ["A", "B"] },
      },
      required: ["side", "amountIn"],
      additionalProperties: false,
    },
  },
  {
    name: "rp_split_plan",
    description: "Split-order planning for bonding-curve trades.",
    inputSchema: {
      type: "object",
      properties: {
        side: { type: "string", enum: ["buy", "sell"] },
        totalAmountIn: { type: "number", exclusiveMinimum: 0 },
        parts: { type: "integer", minimum: 2, maximum: 50 },
        maxSlippageBps: { type: "integer", minimum: 0, maximum: 5000 },
        curve: {
          type: "object",
          properties: {
            virtualBase: { type: "number" },
            virtualToken: { type: "number" },
            feeBps: { type: "number" },
          },
          required: ["virtualBase", "virtualToken"],
          additionalProperties: false,
        },
        preset: { type: "string", enum: ["A", "B"] },
      },
      required: ["side", "totalAmountIn", "parts", "maxSlippageBps"],
      additionalProperties: false,
    },
  },
  {
    name: "verify_unsigned_tx",
    description:
      "Verify an unsigned TRON transaction payload and derive txid from raw_data_hex.",
    inputSchema: {
      type: "object",
      properties: {
        unsignedTx: { type: "object" },
        rawDataHex: { type: "string" },
      },
      anyOf: [{ required: ["unsignedTx"] }, { required: ["rawDataHex"] }],
      additionalProperties: false,
    },
  },
  {
    name: "create_unsigned_transfer",
    description: "Create an unsigned TRX transfer transaction (Nile).",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string" },
        to: { type: "string" },
        amountSun: { type: "number" },
      },
      required: ["from", "to", "amountSun"],
      additionalProperties: false,
    },
  },
];

function jsonError(
  tool,
  code,
  message,
  extra = {},
  source = "tronscan/trongrid",
  summaryZh = "",
) {
  return {
    ok: false,
    tool,
    chain: "TRON",
    error: { code, message, ...extra },
    summary: { zh: summaryZh },
    meta: {
      ts: Date.now(),
      source,
      requestId: crypto.randomUUID(),
    },
  };
}

function jsonOk(tool, data, summaryZh, source = "tronscan/trongrid") {
  return {
    ok: true,
    tool,
    chain: "TRON",
    data,
    summary: { zh: summaryZh },
    meta: {
      ts: Date.now(),
      source,
      requestId: crypto.randomUUID(),
    },
  };
}

function isValidAddress(address) {
  return (
    typeof address === "string" &&
    address.startsWith("T") &&
    address.length >= 30 &&
    address.length <= 40
  );
}

function isValidTxid(txid) {
  return typeof txid === "string" && /^[0-9a-fA-F]{64}$/.test(txid);
}

function normalizeHex(input) {
  if (typeof input !== "string") return null;
  const raw = input.startsWith("0x") ? input.slice(2) : input;
  if (!raw || raw.length % 2 !== 0) return null;
  if (!/^[0-9a-fA-F]+$/.test(raw)) return null;
  return raw.toLowerCase();
}

function normalizeAddressLike(addressLike) {
  if (typeof addressLike !== "string") return null;
  const value = addressLike.trim();
  if (!value) return null;

  if (value.startsWith("T")) {
    try {
      return {
        base58: value,
        hex: toHexAddress(value).toLowerCase(),
      };
    } catch {
      return null;
    }
  }

  const hex = value.startsWith("0x") ? value.slice(2) : value;
  if (/^[0-9a-fA-F]{42}$/.test(hex)) {
    return {
      base58: null,
      hex: hex.toLowerCase(),
    };
  }

  return null;
}

function deriveTxidFromRawDataHex(rawDataHex) {
  const normalized = normalizeHex(rawDataHex);
  if (!normalized) return null;
  const bytes = Buffer.from(normalized, "hex");
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function formatTokenAmount(raw, decimals) {
  if (raw === null || raw === undefined) return "0";
  if (typeof raw === "number") {
    const v = raw / Math.pow(10, decimals);
    return v.toString();
  }
  if (typeof raw === "string" && raw.includes(".")) return raw;

  const str = String(raw).replace(/^0+/, "") || "0";
  const scale = BigInt(10) ** BigInt(decimals);
  let bi;
  try {
    bi = BigInt(str);
  } catch {
    return "0";
  }

  const intPart = bi / scale;
  const fracPart = bi % scale;
  if (decimals === 0) return intPart.toString();

  let frac = fracPart.toString().padStart(decimals, "0");
  frac = frac.replace(/0+$/, "");
  return frac ? `${intPart.toString()}.${frac}` : intPart.toString();
}

function toFixed2(numStr) {
  const n = Number(numStr);
  if (Number.isNaN(n)) return "0.00";
  return n.toFixed(2);
}

function extractTrc20Balance(payload) {
  if (Array.isArray(payload?.constant_result) && payload.constant_result[0]) {
    return payload.constant_result[0];
  }
  return null;
}

function toStatus(info) {
  const confirmed = Boolean(info?.confirmed);
  const contractRet =
    info?.contractRet ||
    info?.contractResult ||
    info?.finalResult ||
    info?.final_result;
  const revert = info?.revert || info?.reverted || false;

  if (!confirmed) return "PENDING";
  if (revert) return "FAILED";
  if (
    typeof contractRet === "string" &&
    contractRet.toUpperCase() === "SUCCESS"
  )
    return "SUCCESS";
  if (contractRet) return "FAILED";
  return "SUCCESS";
}

function pickChainParam(params, key) {
  if (!Array.isArray(params)) return null;
  const found = params.find((p) => p?.key === key);
  if (!found || found.value === undefined || found.value === null) return null;
  const n = Number(found.value);
  return Number.isNaN(n) ? found.value : n;
}

function logUpstream(meta, bodySnippet) {
  if (process.env.NODE_ENV === "production") return;
  if (!meta) return;
  console.log(`[upstream] ${meta.url}`);
  console.log(
    `[upstream] status=${meta.status} content-type=${meta.contentType}`,
  );
  if (
    meta.contentType &&
    !meta.contentType.includes("application/json") &&
    bodySnippet
  ) {
    console.log(`[upstream] body=${bodySnippet}`);
  }
}

function upstreamError(tool, err, source) {
  return jsonError(
    tool,
    "UPSTREAM_ERROR",
    err.message || "upstream error",
    {
      status: err.status ?? null,
      contentType: err.contentType ?? null,
    },
    source,
  );
}

function parseAddressMeta(address) {
  try {
    if (typeof address !== "string") {
      return {
        base58Valid: false,
        addressHex: null,
        network: "unknown",
        riskHint: "地址格式异常",
      };
    }

    const addressHex = toHexAddress(address).toLowerCase();

    let network = "unknown";
    if (addressHex.startsWith("41")) network = "TRON";

    return {
      base58Valid: true,
      addressHex,
      network,
      riskHint: network === "TRON" ? "未发现明显风险" : "地址网络前缀异常",
    };
  } catch (err) {
    return {
      base58Valid: false,
      addressHex: null,
      network: "unknown",
      riskHint: "地址 Base58 校验失败",
    };
  }
}

function summarizeTxs(list, address) {
  const target = normalizeAddressLike(address);
  const targetBase58 = target?.base58 ?? null;
  const targetHex = target?.hex ?? null;
  let inbound = 0;
  let outbound = 0;
  let total = 0;
  let lastTimestamp = null;

  for (const tx of list) {
    total += 1;
    const owner = tx?.raw_data?.contract?.[0]?.parameter?.value?.owner_address;
    const to = tx?.raw_data?.contract?.[0]?.parameter?.value?.to_address;
    const ts = tx?.block_timestamp || tx?.raw_data?.timestamp || null;
    if (!lastTimestamp && ts) lastTimestamp = ts;

    const ownerNormalized = normalizeAddressLike(owner);
    const toNormalized = normalizeAddressLike(to);
    const ownerMatch =
      ownerNormalized &&
      ((targetBase58 && ownerNormalized.base58 === targetBase58) ||
        (targetHex && ownerNormalized.hex === targetHex));
    const toMatch =
      toNormalized &&
      ((targetBase58 && toNormalized.base58 === targetBase58) ||
        (targetHex && toNormalized.hex === targetHex));

    if (ownerMatch) outbound += 1;
    if (toMatch) inbound += 1;
  }

  return { total, inbound, outbound, lastTimestamp };
}

function resolveCurveInput(curve, preset) {
  if (curve && typeof curve === "object") return curve;
  if (typeof preset === "string" && RP_PRESETS[preset]) return RP_PRESETS[preset];
  return null;
}

async function handleToolCall(tool, args) {
  if (typeof tool !== "string") {
    return {
      status: 400,
      body: jsonError(
        tool ?? "unknown",
        "INVALID_REQUEST",
        "tool must be a string",
      ),
    };
  }

  if (!TOOLS.find((t) => t.name === tool)) {
    return {
      status: 404,
      body: jsonError(tool, "TOOL_NOT_FOUND", "tool not found"),
    };
  }

  if (tool === "get_network_status") {
    try {
      const [block, params] = await Promise.all([
        getNowBlock(),
        getChainParameters(),
      ]);
      const number = block?.block_header?.raw_data?.number ?? null;
      const timestamp = block?.block_header?.raw_data?.timestamp ?? null;
      const list = params?.chainParameter || params?.chain_parameters || [];
      const energyFee = pickChainParam(list, "getEnergyFee");
      const transactionFee = pickChainParam(list, "getTransactionFee");
      const bandwidthPrice = pickChainParam(list, "getBandwidthPrice");
      const gas = {
        energyFee,
        transactionFee,
        bandwidthPrice,
      };
      return {
        status: 200,
        body: jsonOk(
          tool,
          {
            latestBlock: { number, timestamp },
            gas,
            health: "ok",
          },
          "网络正常（已获取 Gas 参数）",
          "trongrid",
        ),
      };
    } catch (err) {
      return { status: 502, body: upstreamError(tool, err, "trongrid") };
    }
  }

  if (tool === "get_usdt_balance") {
    const { address } = args ?? {};
    if (!isValidAddress(address)) {
      return {
        status: 400,
        body: jsonError(
          tool,
          "INVALID_ADDRESS",
          "address must start with T and length 30-40",
        ),
      };
    }

    try {
      const [acctRes, usdtRes] = await Promise.all([
        getAccount(address, { includeMeta: true }),
        getTrc20Balance(address, USDT_CONTRACT, { includeMeta: true }),
      ]);

      logUpstream(acctRes.meta);
      logUpstream(usdtRes.meta);

      const acct = acctRes.data;
      const trxBalanceSun = acct?.balance ?? 0;
      const trxBalance = formatTokenAmount(trxBalanceSun, 6);

      const usdtHex = extractTrc20Balance(usdtRes.data);
      const usdtRaw = usdtHex ? BigInt(`0x${usdtHex}`).toString() : "0";
      const usdtDecimals = 6;
      const usdtBalance = formatTokenAmount(usdtRaw, usdtDecimals);
      const addressMeta = parseAddressMeta(address);

      const summary = `该地址 USDT 余额 ${toFixed2(usdtBalance)}，TRX 余额 ${toFixed2(trxBalance)}。地址校验：${addressMeta.base58Valid ? "通过" : "失败"}`;
      return {
        status: 200,
        body: jsonOk(
          tool,
          {
            address,
            trx: { balance: trxBalance, balanceSun: String(trxBalanceSun) },
            usdt: {
              balance: usdtBalance,
              balanceRaw: String(usdtRaw ?? "0"),
              decimals: usdtDecimals,
              contract: USDT_CONTRACT,
            },
            addressMeta,
          },
          summary,
          "trongrid",
        ),
      };
    } catch (err) {
      logUpstream(
        { url: err.url, status: err.status, contentType: err.contentType },
        err.bodySnippet,
      );
      return { status: 502, body: upstreamError(tool, err, "trongrid") };
    }
  }

  if (tool === "get_tx_status") {
    const { txid } = args ?? {};
    if (!isValidTxid(txid)) {
      return {
        status: 400,
        body: jsonError(tool, "INVALID_TXID", "txid must be 64 hex chars"),
      };
    }

    try {
      const info = await getTransactionInfo(txid);
      const status = toStatus(info);
      const block = info?.block ?? info?.blockNumber ?? null;
      const timestamp = info?.timestamp ?? info?.block_timestamp ?? null;
      const timeText = timestamp ? new Date(timestamp).toISOString() : "";
      const summary =
        status === "PENDING" ? "交易未确认" : `交易已确认，时间 ${timeText}`;

      return {
        status: 200,
        body: jsonOk(
          tool,
          { txid, status, block, timestamp },
          summary,
          "tronscan",
        ),
      };
    } catch (err) {
      return { status: 502, body: upstreamError(tool, err, "tronscan") };
    }
  }

  if (tool === "rp_quote") {
    const { side, amountIn, curve, preset } = args ?? {};
    const curveInput = resolveCurveInput(curve, preset);
    if (!curveInput) {
      return {
        status: 400,
        body: jsonError(
          tool,
          "INVALID_CURVE",
          "Provide curve or preset(A/B)",
        ),
      };
    }
    try {
      const q = quoteBySide(curveInput, side, amountIn);
      const summary = `Quote ${side}: in ${q.amountIn.toFixed(6)}, out ${q.amountOut.toFixed(6)}, impact ${q.priceImpactPct.toFixed(4)}%`;
      return {
        status: 200,
        body: jsonOk(
          tool,
          {
            summary,
            key_facts: {
              amountIn: q.amountIn,
              amountOut: q.amountOut,
              avgPrice: q.avgPrice,
              spotPriceBefore: q.spotPriceBefore,
              spotPriceAfter: q.spotPriceAfter,
              priceImpactPct: q.priceImpactPct,
            },
            next_steps: ["Call rp_split_plan to compare single vs split."],
            raw: q,
          },
          summary,
          "local-robinpump",
        ),
      };
    } catch (err) {
      return {
        status: 400,
        body: jsonError(tool, "INVALID_INPUT", err.message || "invalid input"),
      };
    }
  }

  if (tool === "rp_split_plan") {
    const { side, totalAmountIn, parts, maxSlippageBps, curve, preset } = args ?? {};
    const curveInput = resolveCurveInput(curve, preset);
    if (!curveInput) {
      return {
        status: 400,
        body: jsonError(
          tool,
          "INVALID_CURVE",
          "Provide curve or preset(A/B)",
        ),
      };
    }
    try {
      const planResult = buildSplitPlan(curveInput, side, totalAmountIn, parts);
      const maxImpactPct = Number(maxSlippageBps) / 100;
      const maxTrancheImpact = Math.max(
        ...planResult.plan.map((x) => Math.abs(x.expectedImpactPct)),
      );
      const summary = `Split ${parts}: singleImpact=${planResult.single.priceImpactPct.toFixed(4)}%, splitAvgImpact=${planResult.splitAvgImpactPct.toFixed(4)}%`;
      return {
        status: 200,
        body: jsonOk(
          tool,
          {
            summary,
            plan: planResult.plan,
            comparison: {
              singleTradeImpactPct: planResult.single.priceImpactPct,
              splitAvgImpactPct: planResult.splitAvgImpactPct,
              splitTotalOut: planResult.splitTotalOut,
              singleTotalOut: planResult.single.amountOut,
            },
            next_steps: maxTrancheImpact > maxImpactPct
              ? [
                  "Current split exceeds maxSlippageBps; increase parts or reduce totalAmountIn.",
                ]
              : ["Plan is within maxSlippageBps threshold."],
          },
          summary,
          "local-robinpump",
        ),
      };
    } catch (err) {
      return {
        status: 400,
        body: jsonError(tool, "INVALID_INPUT", err.message || "invalid input"),
      };
    }
  }

  if (tool === "verify_unsigned_tx") {
    const unsignedTx = args?.unsignedTx;
    const argRawDataHex = args?.rawDataHex;
    if (
      unsignedTx !== undefined &&
      (typeof unsignedTx !== "object" ||
        unsignedTx === null ||
        Array.isArray(unsignedTx))
    ) {
      return {
        status: 400,
        body: jsonError(
          tool,
          "INVALID_UNSIGNED_TX",
          "unsignedTx must be an object",
        ),
      };
    }
    if (argRawDataHex !== undefined && typeof argRawDataHex !== "string") {
      return {
        status: 400,
        body: jsonError(
          tool,
          "INVALID_RAW_DATA_HEX",
          "rawDataHex must be a string",
        ),
      };
    }

    const rawDataHexInput = argRawDataHex ?? unsignedTx?.raw_data_hex;
    if (typeof rawDataHexInput !== "string") {
      return {
        status: 400,
        body: jsonError(
          tool,
          "MISSING_RAW_DATA_HEX",
          "Provide rawDataHex or unsignedTx.raw_data_hex",
        ),
      };
    }

    const rawDataHex = normalizeHex(rawDataHexInput);
    if (!rawDataHex) {
      return {
        status: 400,
        body: jsonError(
          tool,
          "INVALID_RAW_DATA_HEX",
          "rawDataHex must be even-length hex string",
        ),
      };
    }

    const txid = deriveTxidFromRawDataHex(rawDataHex);
    const signatures = Array.isArray(unsignedTx?.signature)
      ? unsignedTx.signature
      : [];
    const hasSignature = signatures.length > 0;
    const contract = unsignedTx?.raw_data?.contract?.[0];
    const contractType = contract?.type ?? null;
    const value = contract?.parameter?.value ?? {};
    const ownerAddress = value.owner_address ?? null;
    const toAddress = value.to_address ?? null;
    const ownerNorm = ownerAddress ? normalizeAddressLike(ownerAddress) : null;
    const toNorm = toAddress ? normalizeAddressLike(toAddress) : null;
    const amountSun = value.amount ?? null;
    const expiration = Number.isFinite(unsignedTx?.raw_data?.expiration)
      ? unsignedTx.raw_data.expiration
      : null;
    const now = Date.now();
    const expired = expiration !== null ? expiration <= now : null;

    const warnings = [];
    if (hasSignature)
      warnings.push("交易对象包含 signature 字段，不是未签名交易");
    if (ownerAddress && !ownerNorm) warnings.push("owner_address 格式无效");
    if (toAddress && !toNorm) warnings.push("to_address 格式无效");
    if (amountSun !== null && Number(amountSun) < 0)
      warnings.push("amount 不能小于 0");
    if (expired === true) warnings.push("交易已过期");

    const valid =
      !hasSignature &&
      (ownerAddress ? Boolean(ownerNorm) : true) &&
      (toAddress ? Boolean(toNorm) : true) &&
      expired !== true &&
      Boolean(txid);

    const summary = valid
      ? "未签名交易校验通过，可用于后续签名流程"
      : `未签名交易存在 ${warnings.length || 1} 项风险，请修正后再签名`;

    return {
      status: 200,
      body: jsonOk(
        tool,
        {
          valid,
          txid,
          isUnsigned: !hasSignature,
          hasSignature,
          contractType,
          ownerAddress,
          ownerAddressValid: ownerAddress ? Boolean(ownerNorm) : null,
          toAddress,
          toAddressValid: toAddress ? Boolean(toNorm) : null,
          amountSun: amountSun !== null ? String(amountSun) : null,
          amountTrx:
            amountSun !== null ? formatTokenAmount(String(amountSun), 6) : null,
          expiration,
          expired,
          warnings,
        },
        summary,
        "local-validation",
      ),
    };
  }

  if (tool === "create_unsigned_transfer") {
    const { from, to, amountSun } = args ?? {};
    if (!isValidAddress(from) || !isValidAddress(to)) {
      return {
        status: 400,
        body: jsonError(
          tool,
          "INVALID_ADDRESS",
          "from/to must be valid TRON addresses",
        ),
      };
    }
    const amount = Number(amountSun);
    if (!Number.isFinite(amount) || amount <= 0) {
      return {
        status: 400,
        body: jsonError(
          tool,
          "INVALID_AMOUNT",
          "amountSun must be a positive number",
        ),
      };
    }

    try {
      const tx = await createTransferTransaction(from, to, amount, {
        includeMeta: true,
      });
      logUpstream(tx.meta);
      const errMsg = tx?.data?.Error || tx?.data?.error || null;
      if (errMsg) {
        return {
          status: 400,
          body: jsonError(
            tool,
            "UPSTREAM_VALIDATE_ERROR",
            String(errMsg),
            {},
            "trongrid",
            "创建未签名交易失败（上游校验错误）",
          ),
        };
      }
      return {
        status: 200,
        body: jsonOk(
          tool,
          { transaction: tx.data },
          "已生成未签名交易对象",
          "trongrid",
        ),
      };
    } catch (err) {
      logUpstream(
        { url: err.url, status: err.status, contentType: err.contentType },
        err.bodySnippet,
      );
      return { status: 502, body: upstreamError(tool, err, "trongrid") };
    }
  }

  if (tool === "get_account_profile") {
    const { address } = args ?? {};
    if (!isValidAddress(address)) {
      return {
        status: 400,
        body: jsonError(
          tool,
          "INVALID_ADDRESS",
          "address must start with T and length 30-40",
        ),
      };
    }

    try {
      const [acctRes, usdtRes, txRes] = await Promise.all([
        getAccount(address, { includeMeta: true }),
        getTrc20Balance(address, USDT_CONTRACT, { includeMeta: true }),
        getAccountTransactions(address, { includeMeta: true }),
      ]);

      logUpstream(acctRes.meta);
      logUpstream(usdtRes.meta);
      logUpstream(txRes.meta);

      const acct = acctRes.data;
      const trxBalanceSun = acct?.balance ?? 0;
      const trxBalance = formatTokenAmount(trxBalanceSun, 6);

      const usdtHex = extractTrc20Balance(usdtRes.data);
      const usdtRaw = usdtHex ? BigInt(`0x${usdtHex}`).toString() : "0";
      const usdtDecimals = 6;
      const usdtBalance = formatTokenAmount(usdtRaw, usdtDecimals);
      const addressMeta = parseAddressMeta(address);

      const txList = Array.isArray(txRes?.data?.data) ? txRes.data.data : [];
      const summaryTx = summarizeTxs(txList, address);
      const lastTime = summaryTx.lastTimestamp
        ? new Date(summaryTx.lastTimestamp).toISOString()
        : null;

      const summary = `近 ${summaryTx.total} 笔交易，入账 ${summaryTx.inbound}，出账 ${summaryTx.outbound}，最近一笔 ${lastTime || "未知"}`;
      return {
        status: 200,
        body: jsonOk(
          tool,
          {
            address,
            trx: { balance: trxBalance, balanceSun: String(trxBalanceSun) },
            usdt: {
              balance: usdtBalance,
              balanceRaw: String(usdtRaw ?? "0"),
              decimals: usdtDecimals,
              contract: USDT_CONTRACT,
            },
            addressMeta,
            activity: {
              recentCount: summaryTx.total,
              inbound: summaryTx.inbound,
              outbound: summaryTx.outbound,
              lastTimestamp: summaryTx.lastTimestamp,
              lastIso: lastTime,
            },
          },
          summary,
          "trongrid",
        ),
      };
    } catch (err) {
      logUpstream(
        { url: err.url, status: err.status, contentType: err.contentType },
        err.bodySnippet,
      );
      return { status: 502, body: upstreamError(tool, err, "trongrid") };
    }
  }

  return {
    status: 400,
    body: jsonError(tool, "INVALID_REQUEST", "unsupported tool"),
  };
}

function startHttpServer() {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": process.env.CORS_ORIGIN || "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization"
      });
      res.end();
      return;
    }

    if (req.method === "GET" && url.pathname === "/health") {
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === "GET" && url.pathname === "/tools") {
      return sendJson(res, 200, { ok: true, tools: TOOLS });
    }

    if (req.method === "POST" && url.pathname === "/call") {
      try {
        const raw = await parseBody(req);
        const body = raw ? JSON.parse(raw) : {};
        const tool = body.tool;
        const args = body.args ?? {};
        const result = await handleToolCall(tool, args);
        return sendJson(res, result.status, result.body);
      } catch (err) {
        return sendJson(
          res,
          400,
          jsonError("unknown", "BAD_JSON", "invalid JSON body"),
        );
      }
    }

    // MCP JSON-RPC over HTTP bridge
    if (req.method === "POST" && url.pathname === "/mcp") {
      let msg;
      try {
        const raw = await parseBody(req);
        msg = raw ? JSON.parse(raw) : {};
      } catch {
        return sendJsonRpcError(res, null, -32700, "Parse error");
      }

      try {
        if (!msg || typeof msg !== "object") {
          return sendJsonRpcError(res, null, -32600, "Invalid Request");
        }

        if (msg.method === "ping") {
          return sendJsonRpcResult(res, msg.id, {});
        }

        if (msg.method === "initialize") {
          return sendJsonRpcResult(res, msg.id, {
            protocolVersion: "2024-11-05",
            serverInfo: SERVER_INFO,
            capabilities: {
              tools: { listChanged: false },
            },
          });
        }

        if (msg.method === "notifications/initialized") {
          if (msg.id === undefined) {
            res.writeHead(204);
            res.end();
            return;
          }
          return sendJsonRpcResult(res, msg.id, {});
        }

        if (msg.method === "tools/list") {
          return sendJsonRpcResult(res, msg.id, { tools: TOOLS });
        }

        if (msg.method === "tools/call") {
          const name = msg?.params?.name;
          const args = msg?.params?.arguments ?? {};
          if (typeof name !== "string" || !name) {
            return sendJsonRpcError(res, msg.id, -32602, "Invalid params", {
              reason: "name is required",
            });
          }
          const result = await handleToolCall(name, args);
          return sendJsonRpcResult(res, msg.id, toMcpToolResult(result.body));
        }

        if (msg.method && msg.method.startsWith("notifications/")) {
          if (msg.id === undefined) {
            res.writeHead(204);
            res.end();
            return;
          }
          return sendJsonRpcResult(res, msg.id, {});
        }

        return sendJsonRpcError(res, msg.id, -32601, "Method not found", {
          method: msg.method ?? null,
        });
      } catch (err) {
        return sendJsonRpcError(res, msg?.id, -32603, "Internal error", {
          message: err?.message || "Unknown",
        });
      }
    }

    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not Found");
  });

  server.listen(MCP_HTTP_PORT, () => {
    console.log(
      `MCP Server + HTTP bridge listening on http://localhost:${MCP_HTTP_PORT}`,
    );
  });
}

const useStdio = process.argv.includes("--stdio");

if (useStdio) {
  startMcpServer({
    tools: TOOLS,
    callTool: async (name, args) => {
      const result = await handleToolCall(name, args);
      return result.body;
    },
    serverInfo: SERVER_INFO,
  }).catch((err) => {
    console.error("MCP stdio error", err);
    process.exit(1);
  });
} else {
  startHttpServer();
}
