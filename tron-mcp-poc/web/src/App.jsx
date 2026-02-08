import { useEffect, useMemo, useState } from "react";
import "./App.css";

const ADDRESS_RE = /^T.{29,39}$/;
const TXID_RE = /^[0-9a-fA-F]{64}$/;

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
  const [tools, setTools] = useState([]);
  const [status, setStatus] = useState("idle");
  const [summary, setSummary] = useState("");
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [showHex, setShowHex] = useState(false);
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
      console.log("base =", base);
      console.log("env =", import.meta.env.VITE_API_BASE_URL);
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

  return (
    <div className="app">
      <div className="orb orb-1" />
      <div className="orb orb-2" />

      <header className="hero">
        <h1 className="hero-title">TRON MCP Demo Console</h1>
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
        </div>
      </section>

      <section className="panel" style={{ marginTop: 18 }}>
        <h3 className="panel-title">Response</h3>
        {status === "loading" && <div className="loading">Running request</div>}
        {errorMsg && <div className="error">Error: {errorMsg}</div>}
        {summary && <div className="summary">{summary}</div>}
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
