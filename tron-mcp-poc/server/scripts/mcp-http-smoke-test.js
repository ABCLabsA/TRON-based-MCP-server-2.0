import assert from "node:assert/strict";

const BASE = process.env.MCP_HTTP_BASE || "http://localhost:8787/mcp";

async function rpc(method, params) {
  const res = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params })
  });
  const data = await res.json();
  if (data.error) {
    const err = new Error(data.error.message || "RPC error");
    err.data = data.error.data;
    throw err;
  }
  return data.result;
}

async function run() {
  const init = await rpc("initialize", {});
  assert.equal(init?.protocolVersion, "2024-11-05");

  const list = await rpc("tools/list", {});
  const names = (list?.tools || []).map((t) => t.name);
  const expected = [
    "get_network_status",
    "get_usdt_balance",
    "get_tx_status",
    "get_account_profile",
    "verify_unsigned_tx",
    "create_unsigned_transfer"
  ];
  for (const name of expected) {
    assert.ok(names.includes(name), `missing tool: ${name}`);
  }

  const call = await rpc("tools/call", { name: "get_network_status", arguments: {} });
  assert.ok(call?.content?.length, "missing content");
  assert.equal(call?.isError, false);

  console.log("MCP HTTP smoke test OK");
}

run().catch((err) => {
  console.error("mcp http smoke test failed", err);
  process.exit(1);
});
