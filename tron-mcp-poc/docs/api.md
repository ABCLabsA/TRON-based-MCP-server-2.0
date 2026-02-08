# API 文档

## 基础信息
- Base URL: `http://localhost:8787`
- 返回格式：
```
{
  "ok": true/false,
  "tool": "...",
  "chain": "TRON",
  "data": {...},
  "summary": { "zh": "..." },
  "meta": { "ts": number, "source": "...", "requestId": "..." }
}
```

## GET /tools
返回工具列表。

示例：
```
curl http://localhost:8787/tools
```

## POST /call
请求体：
```
{ "tool": "<tool_name>", "args": { ... } }
```

### get_network_status
```
{ "tool": "get_network_status", "args": {} }
```

### get_usdt_balance
```
{ "tool": "get_usdt_balance", "args": { "address": "T..." } }
```

### get_tx_status
```
{ "tool": "get_tx_status", "args": { "txid": "<64-hex>" } }
```

### get_account_profile
```
{ "tool": "get_account_profile", "args": { "address": "T..." } }
```

返回包含：
- `addressMeta`：Base58 校验/地址 Hex/风险提示
- `activity`：最近交易统计

### verify_unsigned_tx
```
{
  "tool": "verify_unsigned_tx",
  "args": {
    "rawDataHex": "0a02cafe"
  }
}
```
或：
```
{
  "tool": "verify_unsigned_tx",
  "args": {
    "unsignedTx": {
      "raw_data_hex": "0a02cafe"
    }
  }
}
```

返回包含：
- `valid`：校验是否通过
- `txid`：由 `raw_data_hex` 派生的交易 ID
- `isUnsigned` / `hasSignature`
- `warnings`：风险提示数组

### create_unsigned_transfer
```
{
  "tool": "create_unsigned_transfer",
  "args": {
    "from": "T...",
    "to": "T...",
    "amountSun": 1000000
  }
}
```

返回包含：
- `transaction`：未签名交易对象（包含 `raw_data` 和 `raw_data_hex`）

## 校验规则
- address：以 `T` 开头，长度 30~40，且 Base58Check 校验通过
- txid：64 位 hex
- rawDataHex：偶数长度 hex 字符串

## 错误码
- `INVALID_REQUEST`
- `TOOL_NOT_FOUND`
- `INVALID_ADDRESS`
- `INVALID_TXID`
- `INVALID_AMOUNT`
- `INVALID_UNSIGNED_TX`
- `INVALID_RAW_DATA_HEX`
- `MISSING_RAW_DATA_HEX`
- `UPSTREAM_ERROR`
