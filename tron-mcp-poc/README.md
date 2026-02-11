# RobinPump Trading Copilot (MCP + Web Console)

Pre-trade quote + slippage + split-order plan for bonding-curve tokens to make trading on RobinPump.fun more efficient.

## Overview
RobinPump Trading Copilot is built on top of the existing TRON MCP server with minimal changes.  
It keeps current TRON query/transfer capabilities and adds DeFi Track-oriented pre-trade decision tools:

- `rp_quote`: bonding curve pre-trade quote
- `rp_split_plan`: split-order plan and single-vs-split comparison

## Problem
In bonding-curve token trading:

- Large one-shot orders can cause high slippage
- Failed or inefficient executions are common
- Users lack a pre-trade simulation and execution suggestion layer

## Solution
Use MCP tools as a pre-trade copilot layer:

- Quote expected output and slippage before execution (`rp_quote`)
- Generate split-order plan with risk-aware parameters (`rp_split_plan`)
- Provide slippage protection suggestions
- Keep compatibility with existing TRON execution demo flow

The current version is designed for demo and extensibility; it can be connected to real RobinPump contract parameters in later steps.

## Tool Catalog

### RobinPump Copilot
| Tool | Purpose | Output |
| --- | --- | --- |
| `rp_quote` | Simulate pre-trade quote on bonding curve | expected out, price impact, slippage |
| `rp_split_plan` | Generate split-order execution plan | tranche plan, single vs split comparison |

### Existing TRON Tools
| Tool | Purpose |
| --- | --- |
| `get_network_status` | Network status and chain params |
| `get_usdt_balance` | USDT + TRX balance by address |
| `get_tx_status` | Transaction confirmation status |
| `get_account_profile` | Account summary + recent activity |
| `verify_unsigned_tx` | Unsigned tx validation |
| `create_unsigned_transfer` | Unsigned TRX transfer for TronLink signing |

## Demo (Web Console, ~3 min)
1. Open `/tools` and confirm tool list is loaded.
2. Select `preset A`, call `rp_quote`.
3. Call `rp_split_plan` and show `single vs split` comparison.
4. Optional: run the existing TRON execution demo (`create_unsigned_transfer` -> `Sign & Broadcast`) as execution example.

## Judge Quickstart
Start server first:

```powershell
cd tron-mcp-poc\server
npm install
npm run dev
```

Then run 3 verification calls:

```bash
curl http://localhost:8787/tools
```

```bash
curl -X POST http://localhost:8787/call \
  -H "Content-Type: application/json" \
  -d "{\"tool\":\"rp_quote\",\"args\":{\"preset\":\"A\",\"amountIn\":100,\"slippageBps\":100}}"
```

```bash
curl -X POST http://localhost:8787/call \
  -H "Content-Type: application/json" \
  -d "{\"tool\":\"rp_split_plan\",\"args\":{\"preset\":\"A\",\"amountIn\":1000,\"parts\":4,\"slippageBps\":100}}"
```

## Local Run

### Server
```powershell
cd tron-mcp-poc\server
npm install
npm run dev
```

### Web
```powershell
cd tron-mcp-poc\web
npm install
npm run dev
```

Open: `http://localhost:5173`

## Deployment

### Backend (Railway)
- Required env: `TRONGRID_BASE`, `TRONSCAN_BASE`, `CORS_ORIGIN`

### Frontend (Vercel)
- Required env: `VITE_API_BASE_URL=https://<your-railway-domain>`

## Notes
- Current RobinPump tools are designed as pre-trade simulation and planning layer.
- Real contract-level pricing/execution hooks can be added without changing MCP protocol structure.
