# Demo Script (3-5 min)

## 0:00-0:20 开场
- 讲解词：
  - “我们做的是 TRON MCP Server，把 TronGrid/TronScan 的链上能力封装成 MCP 工具，同时提供 Web Console 和 Claude Desktop 两种调用方式。”

## 0:20-1:30 核心功能模块（Web Console）
1. 展示 `/tools` 已加载（工具数 ≥ 3）。
   - 讲解词：
     - “这里是 MCP tools 列表，包含网络状态、USDT 余额、交易状态、账户画像等核心能力。”
2. **Network Status**
   - 讲解词：
     - “查询当前网络区块高度和 Gas 参数，这是典型的链上网络状态查询。”
3. **USDT Balance**
   - 讲解词：
     - “输入地址后查询 TRC20 USDT 余额，同时返回 TRX 余额。”
4. **Tx Status**
   - 讲解词：
     - “输入交易哈希，返回确认状态与区块时间。”

## 1:30-2:10 MCP 标准封装（Claude Desktop）
- 讲解词：
  - “同一套 Tools 可被 MCP 客户端直接识别调用。Claude Desktop 中 List Tools / Call Tool 能直接访问我们的 MCP Server。”

## 2:10-2:40 安全与规范（AI 可读化）
- 讲解词：
  - “返回里包含 Base58 校验、Hex 地址、风险提示，前端会把十六进制与 Base58 转成人类可读说明，体现 AI Agent 可读化解析。”

## 2:40-3:40 可选扩展：交易闭环
- 讲解词：
  - “我们新增了未签名交易生成工具 `create_unsigned_transfer`，前端接 TronLink，实现签名 + 广播闭环。”
- 演示步骤：
  1. Connect TronLink
  2. 输入接收地址与金额
  3. 点击 **Create Unsigned Transfer**
  4. 点击 **Sign & Broadcast**
  5. 展示返回的 `txid`

## 3:40-4:30 可选扩展：高级查询
- 讲解词：
  - “我们加入账户画像 `get_account_profile`，返回最近交易统计（入账/出账/最近时间），便于更高级的账户分析。”

## 4:30-5:00 收尾
- 讲解词：
  - “核心功能 + MCP 标准封装 + 可读化安全解析已经完整实现，同时支持交易闭环与高级查询扩展。后续可以扩展更多工具和分析能力。”

## MCP 调用验证（附录）
### 1) 验证 stdio MCP（Claude Desktop 也走这个）
```powershell
cd tron-mcp-poc\server
npm run mcp:test
```
预期输出：
- `Tools: ...` 列出工具
- 多个 `get_*` 调用结果

### 2) 验证 HTTP MCP（通用 MCP 客户端也能用）
```powershell
cd tron-mcp-poc\server
npm run mcp:http-test
```
预期输出：
- `initialize` 成功
- `tools/list` 返回工具
- `tools/call` 返回 `content/isError`
