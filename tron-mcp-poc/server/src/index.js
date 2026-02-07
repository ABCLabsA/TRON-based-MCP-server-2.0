import "dotenv/config";
import http from "node:http";
import crypto from "node:crypto";
import { getTransactionInfo } from "./providers/tronscan.js";
import { getAccount, getNowBlock, getTrc20Balance } from "./providers/trongrid.js";
import { startMcpServer } from "./mcp.js";

const DEFAULT_HTTP_PORT = 8787;
const PORT = Number(process.env.PORT || DEFAULT_HTTP_PORT);
const MCP_HTTP_PORT = Number(process.env.MCP_HTTP_PORT || PORT);
const USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const SERVER_INFO = { name: "tron-mcp-server", version: "0.1.0" };

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(data)
  });
  res.end(data);
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
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "get_usdt_balance",
    description: "Get USDT balance for an address.",
    inputSchema: {
      type: "object",
      properties: { address: { type: "string" } },
      required: ["address"],
      additionalProperties: false
    }
  },
  {
    name: "get_tx_status",
    description: "Get transaction status by txid.",
    inputSchema: {
      type: "object",
      properties: { txid: { type: "string" } },
      required: ["txid"],
      additionalProperties: false
    }
  }
];

function jsonError(tool, code, message, extra = {}, source = "tronscan/trongrid", summaryZh = "") {
  return {
    ok: false,
    tool,
    chain: "TRON",
    error: { code, message, ...extra },
    summary: { zh: summaryZh },
    meta: {
      ts: Date.now(),
      source,
      requestId: crypto.randomUUID()
    }
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
      requestId: crypto.randomUUID()
    }
  };
}

function isValidAddress(address) {
  return typeof address === "string" && address.startsWith("T") && address.length >= 30 && address.length <= 40;
}

function isValidTxid(txid) {
  return typeof txid === "string" && /^[0-9a-fA-F]{64}$/.test(txid);
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
  const contractRet = info?.contractRet || info?.contractResult || info?.finalResult || info?.final_result;
  const revert = info?.revert || info?.reverted || false;

  if (!confirmed) return "PENDING";
  if (revert) return "FAILED";
  if (typeof contractRet === "string" && contractRet.toUpperCase() === "SUCCESS") return "SUCCESS";
  if (contractRet) return "FAILED";
  return "SUCCESS";
}

function logUpstream(meta, bodySnippet) {
  if (process.env.NODE_ENV === "production") return;
  if (!meta) return;
  console.log(`[upstream] ${meta.url}`);
  console.log(`[upstream] status=${meta.status} content-type=${meta.contentType}`);
  if (meta.contentType && !meta.contentType.includes("application/json") && bodySnippet) {
    console.log(`[upstream] body=${bodySnippet}`);
  }
}

function upstreamError(tool, err, source) {
  return jsonError(tool, "UPSTREAM_ERROR", err.message || "upstream error", {
    status: err.status ?? null,
    contentType: err.contentType ?? null
  }, source);
}

async function handleToolCall(tool, args) {
  if (typeof tool !== "string") {
    return { status: 400, body: jsonError(tool ?? "unknown", "INVALID_REQUEST", "tool must be a string") };
  }

  if (!TOOLS.find((t) => t.name === tool)) {
    return { status: 404, body: jsonError(tool, "TOOL_NOT_FOUND", "tool not found") };
  }

  if (tool === "get_network_status") {
    try {
      const block = await getNowBlock();
      const number = block?.block_header?.raw_data?.number ?? null;
      const timestamp = block?.block_header?.raw_data?.timestamp ?? null;
      return {
        status: 200,
        body: jsonOk(
          tool,
          {
            latestBlock: { number, timestamp },
            health: "ok"
          },
          "网络正常",
          "trongrid"
        )
      };
    } catch (err) {
      return { status: 502, body: upstreamError(tool, err, "trongrid") };
    }
  }

  if (tool === "get_usdt_balance") {
    const { address } = args ?? {};
    if (!isValidAddress(address)) {
      return { status: 400, body: jsonError(tool, "INVALID_ADDRESS", "address must start with T and length 30-40") };
    }

    if (!process.env.TRONGRID_API_KEY) {
      return {
        status: 401,
        body: jsonError(
          tool,
          "MISSING_API_KEY",
          "TRONGRID_API_KEY is required",
          {},
          "trongrid",
          "请在 server/.env 配置 TRONGRID_API_KEY"
        )
      };
    }

    try {
      const [acctRes, usdtRes] = await Promise.all([
        getAccount(address, { includeMeta: true }),
        getTrc20Balance(address, USDT_CONTRACT, { includeMeta: true })
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

      const summary = `该地址 USDT 余额 ${toFixed2(usdtBalance)}，TRX 余额 ${toFixed2(trxBalance)}`;
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
              contract: USDT_CONTRACT
            }
          },
          summary,
          "trongrid"
        )
      };
    } catch (err) {
      logUpstream({ url: err.url, status: err.status, contentType: err.contentType }, err.bodySnippet);
      return { status: 502, body: upstreamError(tool, err, "trongrid") };
    }
  }

  if (tool === "get_tx_status") {
    const { txid } = args ?? {};
    if (!isValidTxid(txid)) {
      return { status: 400, body: jsonError(tool, "INVALID_TXID", "txid must be 64 hex chars") };
    }

    try {
      const info = await getTransactionInfo(txid);
      const status = toStatus(info);
      const block = info?.block ?? info?.blockNumber ?? null;
      const timestamp = info?.timestamp ?? info?.block_timestamp ?? null;
      const timeText = timestamp ? new Date(timestamp).toISOString() : "";
      const summary = status === "PENDING" ? "交易未确认" : `交易已确认，时间 ${timeText}`;

      return {
        status: 200,
        body: jsonOk(tool, { txid, status, block, timestamp }, summary, "tronscan")
      };
    } catch (err) {
      return { status: 502, body: upstreamError(tool, err, "tronscan") };
    }
  }

  return { status: 400, body: jsonError(tool, "INVALID_REQUEST", "unsupported tool") };
}

function startHttpServer() {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

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
        return sendJson(res, 400, jsonError("unknown", "BAD_JSON", "invalid JSON body"));
      }
    }

    // Minimal MCP JSON-RPC over HTTP bridge
    if (req.method === "POST" && url.pathname === "/mcp") {
      try {
        const raw = await parseBody(req);
        const msg = raw ? JSON.parse(raw) : {};

        if (msg.method === "initialize") {
          return sendJson(res, 200, {
            jsonrpc: "2.0",
            id: msg.id ?? null,
            result: {
              protocolVersion: "2024-11-05",
              serverInfo: SERVER_INFO,
              capabilities: {
                tools: { listChanged: false }
              }
            }
          });
        }

        if (msg.method === "tools/list") {
          return sendJson(res, 200, {
            jsonrpc: "2.0",
            id: msg.id ?? null,
            result: { tools: TOOLS }
          });
        }

        if (msg.method === "tools/call") {
          const name = msg?.params?.name;
          const args = msg?.params?.arguments ?? {};
          const result = await handleToolCall(name, args);
          return sendJson(res, 200, {
            jsonrpc: "2.0",
            id: msg.id ?? null,
            result
          });
        }

        return sendJson(res, 200, {
          jsonrpc: "2.0",
          id: msg.id ?? null,
          result: { ok: true }
        });
      } catch (err) {
        return sendJson(res, 400, { error: "Bad Request" });
      }
    }

    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not Found");
  });

  server.listen(MCP_HTTP_PORT, () => {
    console.log(`MCP Server + HTTP bridge listening on http://localhost:${MCP_HTTP_PORT}`);
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
    serverInfo: SERVER_INFO
  }).catch((err) => {
    console.error("MCP stdio error", err);
    process.exit(1);
  });
} else {
  startHttpServer();
}
