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
Tools: get_network_status, get_usdt_balance, get_tx_status, get_account_profile, verify_unsigned_tx, create_unsigned_transfer
get_network_status:
{ ... ok: true ... }
get_usdt_balance:
{ ... ok: true ... }
get_tx_status:
{ ... ok: true or ok: false for invalid txid ... }
get_account_profile:
{ ... ok: true, includes activity summary ... }
verify_unsigned_tx:
{ ... ok: true, includes valid/txid/warnings ... }
create_unsigned_transfer:
{ ... ok: true, includes raw_data/raw_data_hex ... }
```

## MCP HTTP Smoke Test
Run the HTTP MCP smoke test (assumes server is running on port 8787):
```
cd tron-mcp-poc\server
npm run mcp:http-test
```

### Claude Desktop setup
1) Use `server/mcp.json` as a template.
2) Update the script path to your local `tron-mcp-poc\server\src\index.js`.
3) Optionally add `TRONGRID_API_KEY` in the `env` block for higher quota.
4) Paste the `mcpServers` block into Claude Desktop config.

Config location (Windows):
```
%APPDATA%\Claude\claude_desktop_config.json
```

Restart Claude Desktop. The tools should appear as:
- `get_network_status`
- `get_usdt_balance`
- `get_tx_status`
- `get_account_profile`
- `verify_unsigned_tx`
- `create_unsigned_transfer`

## API Keys (optional on Nile testnet)
- `TRONGRID_API_KEY`: optional on Nile, recommended for better quota stability.

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

### Call tool: get_account_profile
```
curl -X POST http://localhost:8787/call -H "Content-Type: application/json" -d "{\"tool\":\"get_account_profile\",\"args\":{\"address\":\"TQ9d1eZkS4s2a9x1YQ9d1eZkS4s2a9x1YQ\"}}"
```

### Call tool: verify_unsigned_tx
```
curl -X POST http://localhost:8787/call -H "Content-Type: application/json" -d "{\"tool\":\"verify_unsigned_tx\",\"args\":{\"rawDataHex\":\"0a02cafe\"}}"
```

## HTTP client file
See `scripts/test.http` for ready-to-run requests.
