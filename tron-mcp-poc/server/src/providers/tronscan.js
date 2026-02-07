import { fetchJson } from "./http.js";

const BASE = process.env.TRONSCAN_BASE || "https://apilist.tronscanapi.com/api";
const API_KEY = process.env.TRONSCAN_API_KEY || "";

function headers() {
  return API_KEY ? { "TRON-PRO-API-KEY": API_KEY } : {};
}

export async function getAccount(address, options = {}) {
  const url = `${BASE}/accountv2?address=${encodeURIComponent(address)}`;
  return fetchJson(url, { headers: headers(), ...options });
}

export async function getAccountTokens(address, options = {}) {
  const params = new URLSearchParams({
    address,
    start: "0",
    limit: "200",
    show: "1",
    sortBy: "0",
    sortType: "0"
  });
  const url = `${BASE}/account/tokens?${params.toString()}`;
  return fetchJson(url, { headers: headers(), ...options });
}

export async function getTransactionInfo(txid, options = {}) {
  const url = `${BASE}/transaction-info?hash=${encodeURIComponent(txid)}`;
  return fetchJson(url, { headers: headers(), ...options });
}
