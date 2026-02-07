import process from "node:process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function run() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["src/index.js", "--stdio"],
    cwd: process.cwd(),
    env: {
      ...process.env,
    },
    stderr: "pipe",
  });

  if (transport.stderr) {
    transport.stderr.on("data", (chunk) => {
      process.stderr.write(`[server] ${chunk}`);
    });
  }

  const client = new Client(
    { name: "mcp-smoke-test", version: "0.1.0" },
    { capabilities: {} },
  );

  try {
    await client.connect(transport);

    const toolsResult = await client.listTools();
    const toolNames = (toolsResult?.tools || []).map((t) => t.name);
    console.log("Tools:", toolNames.join(", ") || "(none)");

    const network = await client.callTool({
      name: "get_network_status",
      arguments: {},
    });
    console.log("get_network_status:");
    console.log(JSON.stringify(network, null, 2));

    const usdt = await client.callTool({
      name: "get_usdt_balance",
      arguments: { address: "TDsUeaXFJHx7AabwWwkWvtQiSL7vfkxYav" },
    });
    console.log("get_usdt_balance:");
    console.log(JSON.stringify(usdt, null, 2));

    const tx = await client.callTool({
      name: "get_tx_status",
      arguments: {
        txid: "6997790555c6e1458ab51c152c994e34dfe5e67b1cfff00fa1f4340d72e47ae5",
      },
    });
    console.log("get_tx_status:");
    console.log(JSON.stringify(tx, null, 2));
  } finally {
    await client.close().catch(() => {});
  }
}

run().catch((err) => {
  console.error("mcp smoke test failed", err);
  process.exit(1);
});
