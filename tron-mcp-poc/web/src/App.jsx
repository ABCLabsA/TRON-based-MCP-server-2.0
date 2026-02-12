import { useEffect, useMemo, useState } from "react";
import "./App.css";

const ADDRESS_RE = /^T.{29,39}$/;
const TXID_RE = /^[0-9a-fA-F]{64}$/;

const RP_PRESETS = {
  A: {
    label: "Preset A (Low Liquidity)",
    side: "buy",
    totalAmountIn: 100,
    parts: 4,
    maxSlippageBps: 300,
    curve: { virtualBase: 120000, virtualToken: 6000000, feeBps: 30 }
  },
  B: {
    label: "Preset B (Deeper Liquidity)",
    side: "buy",
    totalAmountIn: 100,
    parts: 4,
    maxSlippageBps: 200,
    curve: { virtualBase: 200000, virtualToken: 4000000, feeBps: 50 }
  }
};

function formatToolName(name) {
  return name.replace(/_/g, " ");
}

export default function App() {
  const base = useMemo(() => {
    const v =
      import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE;
    return v ? v.replace(/\/$/, "") : "";
  }, []);

  const [address, setAddress] = useState("");
  const [txid, setTxid] = useState("");
  const [amountTrx, setAmountTrx] = useState("");
  const [tools, setTools] = useState([]);
  const [status, setStatus] = useState("idle");
  const [summary, setSummary] = useState("");
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [showHex, setShowHex] = useState(false);
  const [walletAddress, setWalletAddress] = useState("");
  const [walletStatus, setWalletStatus] = useState("disconnected");
  const [unsignedTx, setUnsignedTx] = useState(null);

  const [rpPreset, setRpPreset] = useState("A");
  const [rpQuoteSide, setRpQuoteSide] = useState(RP_PRESETS.A.side);
  const [rpQuoteAmountIn, setRpQuoteAmountIn] = useState(String(RP_PRESETS.A.totalAmountIn));
  const [rpSplitSide, setRpSplitSide] = useState(RP_PRESETS.A.side);
  const [rpSplitTotalAmountIn, setRpSplitTotalAmountIn] = useState(String(RP_PRESETS.A.totalAmountIn));
  const [rpSplitParts, setRpSplitParts] = useState(String(RP_PRESETS.A.parts));
  const [rpSplitMaxSlippageBps, setRpSplitMaxSlippageBps] = useState(String(RP_PRESETS.A.maxSlippageBps));
  const [rpCurve, setRpCurve] = useState({ ...RP_PRESETS.A.curve });

  const addressHint = "请先输入 Address";
  const txidHint = "请先输入 Txid";
  const disableAddressActions = status === "loading" || !address;
  const disableTxidAction = status === "loading" || !txid;
  const showAddressHint = !address;
  const showTxidHint = !txid;

  async function fetchJson(path, options) {
    const res = await fetch(`${base}${path}`, options);
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = data?.error?.message || data?.message || "Request failed";
      throw new Error(msg);
    }
    return data;
  }

  async function loadTools() {
    try {
      const data = await fetchJson("/tools");
      setTools(Array.isArray(data?.tools) ? data.tools : []);
    } catch {
      setTools([]);
    }
  }

  useEffect(() => {
    loadTools();
  }, []);

  function resetState() {
    setErrorMsg("");
    setSummary("");
    setResult(null);
  }

  async function callTool(tool, args) {
    resetState();
    setStatus("loading");
    try {
      const data = await fetchJson("/call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool, args }),
      });
      setSummary(data?.summary?.zh || "");
      setResult(data);
      setStatus(data?.ok ? "ok" : "error");
      if (data?.ok === false) {
        setErrorMsg(data?.error?.message || "Tool error");
      }
    } catch (err) {
      setStatus("error");
      setErrorMsg(err.message || "Request failed");
    }
  }

  async function connectTronLink() {
    const tronLink = window?.tronLink;
    const tronWeb = window?.tronWeb;
    if (!tronLink || !tronWeb) {
      setStatus("error");
      setErrorMsg("TronLink not detected");
      return;
    }
    try {
      setWalletStatus("connecting");
      await tronLink.request({ method: "tron_requestAccounts" });
      const addr = tronWeb?.defaultAddress?.base58 || "";
      setWalletAddress(addr);
      setWalletStatus(addr ? "connected" : "disconnected");
    } catch (err) {
      setWalletStatus("disconnected");
      setStatus("error");
      setErrorMsg(err.message || "TronLink connection failed");
    }
  }

  function toSun(amount) {
    const tronWeb = window?.tronWeb;
    if (tronWeb?.toSun) {
      return tronWeb.toSun(amount);
    }
    const v = Number(amount);
    if (!Number.isFinite(v)) return null;
    return Math.round(v * 1e6);
  }

  async function createUnsignedTransfer() {
    if (!walletAddress) {
      setStatus("error");
      setErrorMsg("Please connect TronLink first");
      return;
    }
    if (!ADDRESS_RE.test(address)) {
      setStatus("error");
      setErrorMsg("Recipient address must start with T and length 30-40");
      return;
    }
    const sun = toSun(amountTrx);
    if (!sun || sun <= 0) {
      setStatus("error");
      setErrorMsg("Amount must be a positive number");
      return;
    }
    resetState();
    setStatus("loading");
    try {
      const data = await fetchJson("/call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: "create_unsigned_transfer",
          args: { from: walletAddress, to: address, amountSun: Number(sun) },
        }),
      });
      setSummary(data?.summary?.zh || "");
      setResult(data);
      setUnsignedTx(data?.data?.transaction || data?.data || null);
      setStatus(data?.ok ? "ok" : "error");
      if (data?.ok === false) {
        setErrorMsg(data?.error?.message || "Tool error");
      }
    } catch (err) {
      setStatus("error");
      setErrorMsg(err.message || "Request failed");
    }
  }

  async function signAndBroadcast() {
    const tronWeb = window?.tronWeb;
    if (!tronWeb) {
      setStatus("error");
      setErrorMsg("TronWeb not available");
      return;
    }
    const tx = unsignedTx || result?.data?.transaction || result?.data;
    if (!tx) {
      setStatus("error");
      setErrorMsg("No unsigned transaction to sign");
      return;
    }
    if (!tx?.raw_data || !Array.isArray(tx?.raw_data?.contract)) {
      setStatus("error");
      setErrorMsg("Invalid transaction payload: missing raw_data.contract");
      return;
    }
    try {
      setStatus("loading");
      const signed = await tronWeb.trx.sign(tx);
      const receipt = await tronWeb.trx.sendRawTransaction(signed);
      setSummary("Broadcast completed");
      setResult(receipt);
      setStatus(receipt?.result ? "ok" : "error");
      if (!receipt?.result) {
        setErrorMsg(receipt?.message || "Broadcast failed");
      }
    } catch (err) {
      setStatus("error");
      setErrorMsg(err.message || "Signing failed");
    }
  }

  function applyRpPreset(name) {
    const preset = RP_PRESETS[name];
    if (!preset) return;
    setRpPreset(name);
    setRpQuoteSide(preset.side);
    setRpQuoteAmountIn(String(preset.totalAmountIn));
    setRpSplitSide(preset.side);
    setRpSplitTotalAmountIn(String(preset.totalAmountIn));
    setRpSplitParts(String(preset.parts));
    setRpSplitMaxSlippageBps(String(preset.maxSlippageBps));
    setRpCurve({ ...preset.curve });
  }

  function toCurvePayload() {
    return {
      virtualBase: Number(rpCurve.virtualBase),
      virtualToken: Number(rpCurve.virtualToken),
      feeBps: Number(rpCurve.feeBps || 0),
    };
  }

  function onRpQuote() {
    const amountIn = Number(rpQuoteAmountIn);
    if (!Number.isFinite(amountIn) || amountIn <= 0) {
      setStatus("error");
      setErrorMsg("Quote amount must be > 0");
      return;
    }
    callTool("rp_quote", {
      preset: rpPreset,
      side: rpQuoteSide,
      amountIn,
      curve: toCurvePayload(),
    });
  }

  function onRpSplitPlan() {
    const totalAmountIn = Number(rpSplitTotalAmountIn);
    const parts = Number(rpSplitParts);
    const maxSlippageBps = Number(rpSplitMaxSlippageBps);

    if (!Number.isFinite(totalAmountIn) || totalAmountIn <= 0) {
      setStatus("error");
      setErrorMsg("Split total amount must be > 0");
      return;
    }
    if (!Number.isInteger(parts) || parts < 2 || parts > 50) {
      setStatus("error");
      setErrorMsg("parts must be an integer in [2, 50]");
      return;
    }
    if (!Number.isInteger(maxSlippageBps) || maxSlippageBps < 0 || maxSlippageBps > 5000) {
      setStatus("error");
      setErrorMsg("maxSlippageBps must be an integer in [0, 5000]");
      return;
    }

    callTool("rp_split_plan", {
      preset: rpPreset,
      side: rpSplitSide,
      totalAmountIn,
      parts,
      maxSlippageBps,
      curve: toCurvePayload(),
    });
  }

  function onNetworkStatus() {
    callTool("get_network_status", {});
  }

  function onUsdtBalance() {
    if (!ADDRESS_RE.test(address)) {
      setStatus("error");
      setErrorMsg("Address must start with T and length 30-40");
      return;
    }
    callTool("get_usdt_balance", { address });
  }

  function onTxStatus() {
    if (!TXID_RE.test(txid)) {
      setStatus("error");
      setErrorMsg("Txid must be 64 hex characters");
      return;
    }
    callTool("get_tx_status", { txid });
  }

  function onAccountProfile() {
    if (!ADDRESS_RE.test(address)) {
      setStatus("error");
      setErrorMsg("Address must start with T and length 30-40");
      return;
    }
    callTool("get_account_profile", { address });
  }

  const addressMeta = result?.data?.addressMeta;
  const activity = result?.data?.activity;
  const gas = result?.data?.gas;
  const hex = addressMeta?.addressHex || "";
  const shortHex = hex ? `${hex.slice(0, 8)}…${hex.slice(-6)}` : "-";
  const aiExplain = addressMeta
    ? `地址 ${addressMeta.base58Valid ? "通过" : "未通过"} Base58 校验，网络识别为 ${addressMeta.network || "未知"}。十六进制地址为 ${hex || "未知"}。风险提示：${addressMeta.riskHint || "无"}。`
    : summary
    ? `请求结果：${summary}`
    : "";

  const rpKeyFacts = result?.data?.key_facts;
  const rpPlan = Array.isArray(result?.data?.plan) ? result.data.plan : [];
  const rpComparison = result?.data?.comparison;
  const isRpQuoteResult = result?.ok && result?.tool === "rp_quote";
  const isRpSplitResult = result?.ok && result?.tool === "rp_split_plan";

  return (
    <div className="app">
      <div className="orb orb-1" />
      <div className="orb orb-2" />

      <header className="hero">
        <h1 className="hero-title">TRON MCP Console</h1>
        <p className="hero-sub">
          A focused command surface for probing TRON network status, balances,
          and transaction health. Keep requests tight, inspect structured
          responses, iterate fast.
        </p>
        <div className="status-row">
          <div className="pill">
            <span className="label">API Base</span>
            <strong>{base || "(use Vite proxy / relative)"}</strong>
          </div>
          <div className="pill">
            <span className="label">Tools</span>
            <strong>{tools.length || 0}</strong>
          </div>
          <div className="pill">
            <span className="label">Status</span>
            <strong>{status}</strong>
          </div>
        </div>
      </header>

      <section className="grid two">
        <div className="panel">
          <h3 className="panel-title">Wallet Address</h3>
          <label className="label" htmlFor="address-input">
            Address
          </label>
          <input
            id="address-input"
            className="input"
            value={address}
            onChange={(e) => setAddress(e.target.value.trim())}
            placeholder="T..."
          />
        </div>
        <div className="panel">
          <h3 className="panel-title">Transaction ID</h3>
          <label className="label" htmlFor="txid-input">
            Txid
          </label>
          <input
            id="txid-input"
            className="input"
            value={txid}
            onChange={(e) => setTxid(e.target.value.trim())}
            placeholder="64 hex chars"
          />
        </div>
      </section>

      <section className="grid two" style={{ marginTop: 16 }}>
        <div className="panel">
          <h3 className="panel-title">TronLink Wallet</h3>
          <div className="status-row">
            <div className="pill">
              <span className="label">Wallet</span>
              <strong>{walletAddress || "Not connected"}</strong>
            </div>
            <button
              onClick={connectTronLink}
              className="btn tertiary"
              disabled={walletStatus === "connecting"}
            >
              {walletStatus === "connecting" ? "Connecting..." : "Connect TronLink"}
            </button>
          </div>
        </div>
        <div className="panel">
          <h3 className="panel-title">Transfer Amount (TRX)</h3>
          <label className="label" htmlFor="amount-input">
            Amount
          </label>
          <input
            id="amount-input"
            className="input"
            value={amountTrx}
            onChange={(e) => setAmountTrx(e.target.value)}
            placeholder="1.5"
          />
        </div>
      </section>

      <section className="panel" style={{ marginTop: 18 }}>
        <h3 className="panel-title">Actions</h3>
        <div className="actions">
          <span className="hint-wrap" data-tooltip="">
            <button
              onClick={onNetworkStatus}
              disabled={status === "loading"}
              className="btn primary"
              style={{ pointerEvents: status === "loading" ? "none" : "auto" }}
            >
              Network Status
            </button>
          </span>
          <span
            className="hint-wrap"
            data-tooltip={showAddressHint ? addressHint : ""}
          >
            <button
              onClick={onUsdtBalance}
              disabled={disableAddressActions}
              className="btn secondary"
              style={{ pointerEvents: disableAddressActions ? "none" : "auto" }}
            >
              USDT Balance
            </button>
          </span>
          <span
            className="hint-wrap"
            data-tooltip={showAddressHint ? addressHint : ""}
          >
            <button
              onClick={onAccountProfile}
              disabled={disableAddressActions}
              className="btn tertiary"
              style={{ pointerEvents: disableAddressActions ? "none" : "auto" }}
            >
              Account Profile
            </button>
          </span>
          <span
            className="hint-wrap"
            data-tooltip={showTxidHint ? txidHint : ""}
          >
            <button
              onClick={onTxStatus}
              disabled={disableTxidAction}
              className="btn ghost"
              style={{ pointerEvents: disableTxidAction ? "none" : "auto" }}
            >
              Tx Status
            </button>
          </span>
          <span
            className="hint-wrap"
            data-tooltip={showAddressHint ? addressHint : ""}
          >
            <button
              onClick={createUnsignedTransfer}
              disabled={!walletAddress || disableAddressActions}
              className="btn secondary"
              style={{
                pointerEvents:
                  !walletAddress || disableAddressActions ? "none" : "auto",
              }}
            >
              Create Unsigned Transfer
            </button>
          </span>
          <span
            className="hint-wrap"
            data-tooltip={!walletAddress ? "Connect TronLink first" : ""}
          >
            <button
              onClick={signAndBroadcast}
              disabled={!walletAddress}
              className="btn primary"
              style={{ pointerEvents: !walletAddress ? "none" : "auto" }}
            >
              Sign & Broadcast
            </button>
          </span>
        </div>
      </section>

      <section className="panel" style={{ marginTop: 18 }}>
        <div className="tools-header">
          <div>
            <h3 className="panel-title">RobinPump Copilot</h3>
            <p className="tools-sub">选择预设后可一键演示 quote 与拆单对比。</p>
          </div>
          <div className="rp-presets">
            <button
              className={`btn ${rpPreset === "A" ? "primary" : "ghost"}`}
              onClick={() => applyRpPreset("A")}
            >
              {RP_PRESETS.A.label}
            </button>
            <button
              className={`btn ${rpPreset === "B" ? "primary" : "ghost"}`}
              onClick={() => applyRpPreset("B")}
            >
              {RP_PRESETS.B.label}
            </button>
          </div>
        </div>

        <div className="rp-grid" style={{ marginTop: 12 }}>
          <div className="rp-card">
            <h4 className="panel-title">Quote</h4>
            <div className="rp-fields">
              <label className="label">Side</label>
              <select
                className="input"
                value={rpQuoteSide}
                onChange={(e) => setRpQuoteSide(e.target.value)}
              >
                <option value="buy">buy</option>
                <option value="sell">sell</option>
              </select>

              <label className="label">Amount In</label>
              <input
                className="input"
                value={rpQuoteAmountIn}
                onChange={(e) => setRpQuoteAmountIn(e.target.value)}
                placeholder="100"
              />

              <label className="label">virtualBase</label>
              <input
                className="input"
                value={rpCurve.virtualBase}
                onChange={(e) =>
                  setRpCurve((prev) => ({ ...prev, virtualBase: e.target.value }))
                }
              />

              <label className="label">virtualToken</label>
              <input
                className="input"
                value={rpCurve.virtualToken}
                onChange={(e) =>
                  setRpCurve((prev) => ({ ...prev, virtualToken: e.target.value }))
                }
              />

              <label className="label">feeBps</label>
              <input
                className="input"
                value={rpCurve.feeBps}
                onChange={(e) =>
                  setRpCurve((prev) => ({ ...prev, feeBps: e.target.value }))
                }
              />
            </div>
            <button className="btn primary" onClick={onRpQuote}>Run rp_quote</button>
          </div>

          <div className="rp-card">
            <h4 className="panel-title">Split Plan</h4>
            <div className="rp-fields">
              <label className="label">Side</label>
              <select
                className="input"
                value={rpSplitSide}
                onChange={(e) => setRpSplitSide(e.target.value)}
              >
                <option value="buy">buy</option>
                <option value="sell">sell</option>
              </select>

              <label className="label">Total Amount</label>
              <input
                className="input"
                value={rpSplitTotalAmountIn}
                onChange={(e) => setRpSplitTotalAmountIn(e.target.value)}
                placeholder="100"
              />

              <label className="label">Parts (2-50)</label>
              <input
                className="input"
                value={rpSplitParts}
                onChange={(e) => setRpSplitParts(e.target.value)}
              />

              <label className="label">Max Slippage (bps)</label>
              <input
                className="input"
                value={rpSplitMaxSlippageBps}
                onChange={(e) => setRpSplitMaxSlippageBps(e.target.value)}
              />
            </div>
            <button className="btn secondary" onClick={onRpSplitPlan}>Run rp_split_plan</button>
          </div>
        </div>
      </section>

      <section className="panel" style={{ marginTop: 18 }}>
        <h3 className="panel-title">Response</h3>
        {status === "loading" && <div className="loading">Running request</div>}
        {errorMsg && <div className="error">Error: {errorMsg}</div>}
        {summary && <div className="summary">{summary}</div>}

        {isRpQuoteResult && rpKeyFacts && (
          <div className="rp-output" style={{ marginTop: 10 }}>
            <h4 className="panel-title">Key Facts</h4>
            <div className="safety-grid">
              <div className="safety-card"><div className="label">amountIn</div><div className="value mono">{rpKeyFacts.amountIn}</div></div>
              <div className="safety-card"><div className="label">amountOut</div><div className="value mono">{rpKeyFacts.amountOut}</div></div>
              <div className="safety-card"><div className="label">avgPrice</div><div className="value mono">{rpKeyFacts.avgPrice}</div></div>
              <div className="safety-card"><div className="label">priceImpactPct</div><div className="value mono">{rpKeyFacts.priceImpactPct}%</div></div>
            </div>
          </div>
        )}

        {isRpSplitResult && (
          <div className="rp-output" style={{ marginTop: 10 }}>
            {rpComparison && (
              <div className="safety-grid">
                <div className="safety-card"><div className="label">singleTradeImpactPct</div><div className="value mono">{rpComparison.singleTradeImpactPct}%</div></div>
                <div className="safety-card"><div className="label">splitAvgImpactPct</div><div className="value mono">{rpComparison.splitAvgImpactPct}%</div></div>
                <div className="safety-card"><div className="label">singleTotalOut</div><div className="value mono">{rpComparison.singleTotalOut}</div></div>
                <div className="safety-card"><div className="label">splitTotalOut</div><div className="value mono">{rpComparison.splitTotalOut}</div></div>
              </div>
            )}
            {rpPlan.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <h4 className="panel-title">Split Plan</h4>
                <div className="table-wrap">
                  <table className="rp-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>amountIn</th>
                        <th>expectedOut</th>
                        <th>expectedImpactPct</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rpPlan.map((row) => (
                        <tr key={row.index}>
                          <td>{row.index}</td>
                          <td>{row.amountIn}</td>
                          <td>{row.expectedOut}</td>
                          <td>{row.expectedImpactPct}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        <pre className="result">
          {result ? JSON.stringify(result, null, 2) : "(no result)"}
        </pre>
      </section>

      {addressMeta && (
        <section className="panel" style={{ marginTop: 18 }}>
          <h3 className="panel-title">Address Safety Snapshot</h3>
          <div className="safety-grid">
            <div className="safety-card">
              <div className="label">Base58 Valid</div>
              <div className="value">
                {addressMeta.base58Valid ? "YES" : "NO"}
              </div>
            </div>
            <div className="safety-card">
              <div className="label">Network</div>
              <div className="value">{addressMeta.network}</div>
            </div>
            <div className="safety-card">
              <div className="label">Address Hex</div>
              <div className="value mono clamp">{showHex ? hex : shortHex}</div>
              {hex && (
                <button
                  className="link-btn"
                  onClick={() => setShowHex((v) => !v)}
                >
                  {showHex ? "收起" : "展开"}
                </button>
              )}
            </div>
            <div className="safety-card">
              <div className="label">Risk Hint</div>
              <div className="value">{addressMeta.riskHint || "-"}</div>
            </div>
          </div>
        </section>
      )}

      {aiExplain && (
        <section className="panel" style={{ marginTop: 18 }}>
          <h3 className="panel-title">AI Explanation</h3>
          <div className="tools">{aiExplain}</div>
        </section>
      )}

      {gas && (
        <section className="panel" style={{ marginTop: 18 }}>
          <h3 className="panel-title">Network Gas</h3>
          <div className="safety-grid gas">
            <div className="safety-card">
              <div className="label">Energy Fee</div>
              <div className="value mono">{gas.energyFee ?? "-"}</div>
            </div>
            <div className="safety-card">
              <div className="label">Transaction Fee</div>
              <div className="value mono">{gas.transactionFee ?? "-"}</div>
            </div>
            <div className="safety-card">
              <div className="label">Bandwidth Price</div>
              <div className="value mono">{gas.bandwidthPrice ?? "-"}</div>
            </div>
          </div>
        </section>
      )}

      {activity && (
        <section className="panel" style={{ marginTop: 18 }}>
          <h3 className="panel-title">Account Activity</h3>
          <div className="safety-grid">
            <div className="safety-card">
              <div className="label">Recent Count</div>
              <div className="value">{activity.recentCount}</div>
            </div>
            <div className="safety-card">
              <div className="label">Inbound</div>
              <div className="value">{activity.inbound}</div>
            </div>
            <div className="safety-card">
              <div className="label">Outbound</div>
              <div className="value">{activity.outbound}</div>
            </div>
            <div className="safety-card">
              <div className="label">Last Seen</div>
              <div className="value mono clamp">{activity.lastIso || "-"}</div>
            </div>
          </div>
        </section>
      )}

      <section className="panel" style={{ marginTop: 18 }}>
        <div className="tools-header">
          <div>
            <h3 className="panel-title">Tools</h3>
            <p className="tools-sub">
              Loaded from <code>/tools</code>. Click a tool to copy its name.
            </p>
          </div>
          <span className="tools-count">{tools.length} tools</span>
        </div>
        <div className="tools-grid">
          {tools.length === 0 && (
            <div className="tools-empty">(no tools loaded)</div>
          )}
          {tools.map((tool) => (
            <button
              key={tool.name}
              className="tool-card"
              onClick={() => navigator.clipboard?.writeText(tool.name)}
            >
              <div className="tool-title">{formatToolName(tool.name)}</div>
              <div className="tool-name">{tool.name}</div>
              <div className="tool-desc">{tool.description || "-"}</div>
              <div className="tool-tags">
                <span>JSON Schema</span>
                <span>
                  {tool.inputSchema?.required?.length
                    ? `${tool.inputSchema.required.length} req`
                    : "0 req"}
                </span>
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
