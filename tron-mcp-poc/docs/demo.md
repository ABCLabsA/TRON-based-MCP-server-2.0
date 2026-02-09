# Demo Script (3-5 min)

## 0:00-0:20 Opening
- Talk track:
  - "We built a TRON MCP Server that wraps TronGrid/TronScan into MCP tools, and provides a Web Console for live demos."

## 0:20-1:30 Core Modules (Web Console)
1. Show `/tools` loaded (tools >= 3).
   - Talk track: "Here is the MCP tools list including network status, USDT balance, tx status, and account profile."
2. **Network Status**
   - Talk track: "Fetches latest block height and Gas parameters."
3. **USDT Balance**
   - Talk track: "Query TRC20 USDT balance and TRX balance for the address."
4. **Tx Status**
   - Talk track: "Query a txid and return confirmation state and block time."

## 1:30-2:10 MCP Standard Compliance (Verification)
- Talk track:
  - "The same tools can be discovered and called by MCP clients."
- Demo (terminal):
```
cd tron-mcp-poc\server
npm run mcp:test
```
- Expected:
  - `Tools: ...` list
  - multiple `get_*` results

## 2:10-2:40 Safety & Readability (AI-readable)
- Talk track:
  - "Responses include Base58 validation, hex address, and risk hints. The UI converts them into human-readable explanations."

## 2:40-3:40 Optional Extension: Transfer Loop
- Talk track:
  - "We added `create_unsigned_transfer` to generate unsigned transactions. The front-end uses TronLink to sign and broadcast."
- Steps:
  1. Connect TronLink
  2. Input recipient + amount
  3. Click **Create Unsigned Transfer**
  4. Click **Sign & Broadcast**
  5. Show returned `txid`

## 3:40-4:30 Optional Extension: Advanced Query
- Talk track:
  - "Account profile returns recent stats (inbound/outbound/last seen) for deeper analysis."

## 4:30-5:00 Wrap-up
- Talk track:
  - "Core tools + MCP compliance + readable security parsing are complete, with transfer loop and advanced queries as extensions."
