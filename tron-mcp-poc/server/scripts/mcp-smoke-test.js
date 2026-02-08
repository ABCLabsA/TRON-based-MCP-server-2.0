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
    const expectedTools = [
      "get_network_status",
      "get_usdt_balance",
      "get_tx_status",
      "get_account_profile",
      "verify_unsigned_tx",
      "create_unsigned_transfer",
    ];
    const missing = expectedTools.filter((name) => !toolNames.includes(name));
    if (missing.length) {
      throw new Error(`Missing tools: ${missing.join(", ")}`);
    }

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

    const profile = await client.callTool({
      name: "get_account_profile",
      arguments: { address: "TDsUeaXFJHx7AabwWwkWvtQiSL7vfkxYav" },
    });
    console.log("get_account_profile:");
    console.log(JSON.stringify(profile, null, 2));

    const verifyUnsigned = await client.callTool({
      name: "verify_unsigned_tx",
      arguments: {
        unsignedTx: {
          raw_data: {
            expiration: 4102444800000,
            contract: [
              {
                type: "TransferContract",
                parameter: {
                  value: {
                    owner_address: "TB3Ttmeh5bgesBmMSqRSjpSmBsufKNgjAN",
                    to_address: "TDsUeaXFJHx7AabwWwkWvtQiSL7vfkxYav",
                    amount: 1,
                  },
                },
              },
            ],
          },
          raw_data_hex: "0a02cafe",
        },
      },
    });
    console.log("verify_unsigned_tx:");
    console.log(JSON.stringify(verifyUnsigned, null, 2));

    const unsignedTransfer = await client.callTool({
      name: "create_unsigned_transfer",
      arguments: {
        from: "TB3Ttmeh5bgesBmMSqRSjpSmBsufKNgjAN",
        to: "TDsUeaXFJHx7AabwWwkWvtQiSL7vfkxYav",
        amountSun: 1,
      },
    });
    console.log("create_unsigned_transfer:");
    console.log(JSON.stringify(unsignedTransfer, null, 2));

    const invalidTx = await client.callTool({
      name: "get_tx_status",
      arguments: { txid: "abc" },
    });
    console.log("get_tx_status (invalid txid):");
    console.log(JSON.stringify(invalidTx, null, 2));
  } finally {
    await client.close().catch(() => {});
  }
}

run().catch((err) => {
  console.error("mcp smoke test failed", err);
  process.exit(1);
});
