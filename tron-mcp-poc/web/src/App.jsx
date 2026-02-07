import { useEffect, useMemo, useState } from "react";

const ADDRESS_RE = /^T.{29,39}$/;
const TXID_RE = /^[0-9a-fA-F]{64}$/;

export default function App() {
  const base = useMemo(() => {
    const v = import.meta.env.VITE_API_BASE;
    return v ? v.replace(/\/$/, "") : "";
  }, []);

  const [address, setAddress] = useState("");
  const [txid, setTxid] = useState("");
  const [tools, setTools] = useState([]);
  const [status, setStatus] = useState("idle");
  const [summary, setSummary] = useState("");
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

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
        body: JSON.stringify({ tool, args })
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

  return (
    <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace", padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <h1>TRON MCP Demo Console</h1>
      <p>API Base: {base || "(use Vite proxy / relative)"}</p>

      <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
        <label>
          Address
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value.trim())}
            placeholder="T..."
            style={{ display: "block", width: "100%", padding: 8, marginTop: 6 }}
          />
        </label>
        <label>
          Txid
          <input
            value={txid}
            onChange={(e) => setTxid(e.target.value.trim())}
            placeholder="64 hex chars"
            style={{ display: "block", width: "100%", padding: 8, marginTop: 6 }}
          />
        </label>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
        <button onClick={onNetworkStatus} disabled={status === "loading"} style={{ padding: "8px 12px" }}>
          Network Status
        </button>
        <button onClick={onUsdtBalance} disabled={status === "loading"} style={{ padding: "8px 12px" }}>
          USDT Balance
        </button>
        <button onClick={onTxStatus} disabled={status === "loading"} style={{ padding: "8px 12px" }}>
          Tx Status
        </button>
      </div>

      <div style={{ marginTop: 20 }}>
        {status === "loading" && <div>Loading...</div>}
        {errorMsg && <div style={{ color: "#b00020" }}>Error: {errorMsg}</div>}
        {summary && <div style={{ fontWeight: 600, marginTop: 8 }}>{summary}</div>}
        <pre style={{ background: "#f6f6f6", padding: 12, marginTop: 8, minHeight: 120 }}>
          {result ? JSON.stringify(result, null, 2) : "(no result)"}
        </pre>
      </div>

      <div style={{ marginTop: 24 }}>
        <h3>Tools (from /tools)</h3>
        <pre style={{ background: "#f6f6f6", padding: 12 }}>
          {tools.length ? JSON.stringify(tools, null, 2) : "(no tools loaded)"}
        </pre>
      </div>
    </div>
  );
}
