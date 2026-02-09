# tron-mcp-poc

TRON Nile 测试网的 MCP 工具化示例，提供 HTTP Bridge + MCP stdio + Web Demo。

## 项目简介
- 将 TRON 链上常用查询封装为 MCP 工具
- 同时提供 HTTP Bridge，方便 Web/脚本调用
- 面向比赛评审的可运行 Demo

## 核心功能
- `get_network_status`：查询最新区块高度与时间戳
- `get_usdt_balance`：查询 TRC20 USDT 余额（含 TRX 余额）
- `get_tx_status`：查询交易状态与确认时间
- `get_account_profile`：账户画像（余额 + 最近交易统计）
- `verify_unsigned_tx`：未签名交易校验（txid 派生、地址格式、过期检查）
- `create_unsigned_transfer`：生成未签名 TRX 转账交易（配合 TronLink 签名/广播）
- 地址安全快照：Base58 校验、地址 Hex、风险提示

## 技术栈
- Node.js 18+（HTTP Bridge + MCP stdio）
- React + Vite（Demo 控制台）
- 上游 API：TronGrid / TronScan（Nile 测试网）

## 快速开始（5分钟）

### 1) 安装依赖
```
cd tron-mcp-poc\server
npm install
cd ..\web
npm install
```

### 2) 配置环境（Nile 测试网）
在 `tron-mcp-poc\server\.env` 中配置：
```
NODE_ENV=development
TRONGRID_BASE=https://nile.trongrid.io
TRONSCAN_BASE=https://nileapi.tronscan.org
TRONGRID_API_KEY=
TRONSCAN_API_KEY=
```
说明：Nile 测试网接口无需 API key，单 IP QPS 限流 50。
注：`TRONGRID_API_KEY` 和 `TRONSCAN_API_KEY` 可选，填写后可提升限额稳定性。

### 3) 启动后端
```
cd tron-mcp-poc\server
npm run dev
```

### 4) 启动前端
```
cd tron-mcp-poc\web
npm run dev
```

打开：`http://localhost:5173`

## 使用示例

### HTTP Bridge
```
curl http://localhost:8787/tools
```

```
curl -X POST http://localhost:8787/call -H "Content-Type: application/json" -d "{\"tool\":\"get_usdt_balance\",\"args\":{\"address\":\"TB3Ttmeh5bgesBmMSqRSjpSmBsufKNgjAN\"}}"
```

### MCP stdio（Claude Desktop）
```
cd tron-mcp-poc\server
npm run mcp:stdio
```
配置模板：`tron-mcp-poc/server/mcp.json`

## Claude Desktop 演示流程
1) 在 Claude 中输入："查询地址 TB3Ttmeh5bgesBmMSqRSjpSmBsufKNgjAN 的 USDT 余额，并给出风险提示"
2) Claude 调用 MCP 工具 `get_usdt_balance`
3) 返回结构化结果（含 `addressMeta`）
4) Claude 输出自然语言总结

## 配置说明
- `TRONGRID_BASE`：TronGrid API 基础地址（Nile: `https://nile.trongrid.io`）
- `TRONSCAN_BASE`：TronScan API 基础地址（Nile: `https://nileapi.tronscan.org`）
- `TRONGRID_API_KEY` / `TRONSCAN_API_KEY`：Nile 测试网可留空

## 常见问题
- 开发和演示必须基于 Nile 测试网
- 接口 QPS 限流 50（单 IP）
- 若需要测试网 TRX，可用水龙头或联系主办方

## 联系方式
- Discord：#gwdc·hackathon-support
- Nile 测试网水龙头：`https://nileex.io/join/getJoinPage`

## 参赛提交材料
必须提交：
- 源代码：GitHub 公有仓库
- `README.md`：项目说明与快速开始
- 部署文档：`docs/deployment.md`
- API 文档：`docs/api.md`

推荐提交：
- 架构文档：`docs/architecture.md`
- 测试报告：`docs/test-report.md`
- 性能报告：`docs/perf_report.md`
- 安全审计：`docs/security.md`
- 商业计划：`docs/business.md`
- 演示视频：5-10 分钟
- Demo Script：`docs/demo.md`

## 截图占位
- Web Console 主界面（截图待补）
- MCP 调用结果（截图待补）
- 终端调用示例（截图待补）
