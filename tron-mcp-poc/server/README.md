### TRON MCP Server

## HTTP Mode (default)
Start the HTTP bridge on `PORT` (default 8787):
```
cd tron-mcp-poc\server
npm install
npm run dev
```

Verify:
```
curl http://localhost:8787/health
curl http://localhost:8787/tools
```

You can change the port with:
```
set PORT=8790
npm run dev
```

## MCP stdio Mode (Claude Desktop)
Run MCP stdio only (no HTTP listener):
```
cd tron-mcp-poc\server
npm run mcp:stdio
```

If you still want HTTP in stdio mode, set a different port:
```
set MCP_HTTP_PORT=8790
npm run mcp:stdio
```

## MCP Step5 Smoke Test
Run the stdio MCP smoke test (starts stdio server as a child process):
```
cd tron-mcp-poc\server
npm run mcp:test
```

Expected output (example):
```
Tools: get_network_status, get_usdt_balance, get_tx_status
get_network_status:
{ ... ok: true ... }
get_usdt_balance:
{ ... ok: true or ok: false if missing TRONGRID_API_KEY ... }
get_tx_status:
{ ... ok: true or ok: false for invalid txid ... }
```

### Claude Desktop setup
1) Use `server/mcp.json` as a template.
2) Update the script path to your local `tron-mcp-poc\server\src\index.js`.
3) Add your `TRONGRID_API_KEY` in the `env` block.
4) Paste the `mcpServers` block into Claude Desktop config.

Config location (Windows):
```
%APPDATA%\Claude\claude_desktop_config.json
```

Restart Claude Desktop. The tools should appear as:
- `get_network_status`
- `get_usdt_balance`
- `get_tx_status`

## API Keys (required for get_usdt_balance)
- `TRONGRID_API_KEY`: required to call TRON Grid APIs for TRC20 balance.

Set it in `server/.env` (see `server/.env.example`).

## Upstream APIs
- TRONGRID: `https://api.trongrid.io`
- TRONSCAN: `https://apilist.tronscanapi.com/api`

## Windows CMD curl examples

### Call tool: get_network_status
```
curl -X POST http://localhost:8787/call -H "Content-Type: application/json" -d "{\"tool\":\"get_network_status\",\"args\":{}}"
```

### Call tool: get_usdt_balance
```
curl -X POST http://localhost:8787/call -H "Content-Type: application/json" -d "{\"tool\":\"get_usdt_balance\",\"args\":{\"address\":\"TQ9d1eZkS4s2a9x1YQ9d1eZkS4s2a9x1YQ\"}}"
```

### Call tool: get_tx_status
```
curl -X POST http://localhost:8787/call -H "Content-Type: application/json" -d "{\"tool\":\"get_tx_status\",\"args\":{\"txid\":\"a3b7f0b8c1f5e9d3a3b7f0b8c1f5e9d3a3b7f0b8c1f5e9d3a3b7f0b8c1f5e9d3\"}}"
```

## HTTP client file
See `scripts/test.http` for ready-to-run requests.
