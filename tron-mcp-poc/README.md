# tron-mcp-poc

TRON 链上数据的 MCP 工具化示例，提供 HTTP Bridge + MCP stdio + Web Demo。

## 一键启动（本地）

### 1) 安装依赖
```
cd tron-mcp-poc\server
npm install
cd ..\web
npm install
```

### 2) 配置 API Key（必须）
在 `tron-mcp-poc\server\.env` 中配置：
```
NODE_ENV=development
TRONGRID_API_KEY=YOUR_TRONGRID_API_KEY
TRONGRID_BASE=https://api.trongrid.io
```

### 3) 启动 Server + Web
```
cd tron-mcp-poc\server
npm run dev
```
```
cd ..\web
npm run dev
```

Web 访问：`http://localhost:5173`

## 功能列表
- MCP 工具：`get_network_status` / `get_usdt_balance` / `get_tx_status`
- HTTP Bridge：`/tools`、`/call`、`/health`
- MCP stdio：可接入 Claude Desktop
- Web Console：输入地址/txid 查看实时结果

## 工具输入输出示例

### 输入示例
```
POST /call
{
  "tool": "get_usdt_balance",
  "args": {
    "address": "TB3Ttmeh5bgesBmMSqRSjpSmBsufKNgjAN"
  }
}
```

### 输出示例
```
{
  "ok": true,
  "tool": "get_usdt_balance",
  "chain": "TRON",
  "data": {
    "address": "TB3Ttmeh5bgesBmMSqRSjpSmBsufKNgjAN",
    "trx": { "balance": "0.09", "balanceSun": "91638" },
    "usdt": { "balance": "0", "balanceRaw": "0", "decimals": 6, "contract": "TR7N..." }
  },
  "summary": { "zh": "该地址 USDT 余额 0.00，TRX 余额 0.09" },
  "meta": { "ts": 0, "source": "trongrid", "requestId": "..." }
}
```

## MCP / Claude Desktop
- 配置示例：`tron-mcp-poc/server/mcp.json`
- 启动 stdio：
```
cd tron-mcp-poc\server
npm run mcp:stdio
```

## 截图占位
- Web Console 主界面（截图待补）
- MCP 调用结果（截图待补）
- 终端调用示例（截图待补）

## 参赛材料
- `docs/demo-script.md`（3分钟 Demo 讲解词 + 分镜）
- `docs/pitch-deck-outline.md`（10页以内 pitch deck 大纲）
