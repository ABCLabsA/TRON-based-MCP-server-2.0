import crypto from "node:crypto";
import { fetchJson } from "./http.js";

const BASE = process.env.TRONGRID_BASE || "https://api.trongrid.io";
const API_KEY = process.env.TRONGRID_API_KEY || "";
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function headers() {
  return API_KEY ? { "TRON-PRO-API-KEY": API_KEY } : {};
}

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest();
}

export function base58CheckDecode(input) {
  let num = 0n;
  let leading = 0;
  for (let i = 0; i < input.length && input[i] === "1"; i += 1) {
    leading += 1;
  }

  for (const ch of input) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error("Invalid base58 character");
    num = num * 58n + BigInt(idx);
  }

  let hex = num.toString(16);
  if (hex.length % 2 === 1) hex = `0${hex}`;
  const bytes = Buffer.from(hex, "hex");
  const result = Buffer.concat([Buffer.alloc(leading, 0), bytes]);

  if (result.length < 4) throw new Error("Invalid base58 length");
  const payload = result.slice(0, -4);
  const checksum = result.slice(-4);
  const hash = sha256(sha256(payload)).slice(0, 4);
  if (!hash.equals(checksum)) throw new Error("Invalid base58 checksum");

  return payload;
}

export function toHexAddress(addressBase58) {
  const payload = base58CheckDecode(addressBase58);
  return payload.toString("hex");
}

export async function getNowBlock(options = {}) {
  const url = `${BASE}/wallet/getnowblock`;
  return fetchJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers() },
    body: JSON.stringify({}),
    ...options
  });
}

export async function getChainParameters(options = {}) {
  const url = `${BASE}/wallet/getchainparameters`;
  return fetchJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers() },
    body: JSON.stringify({}),
    ...options
  });
}

export async function getAccount(address, options = {}) {
  const url = `${BASE}/wallet/getaccount`;
  return fetchJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers() },
    body: JSON.stringify({ address, visible: true }),
    ...options
  });
}

export async function getTrc20Balance(address, contractAddress, options = {}) {
  const addressHex = toHexAddress(address);
  const parameter = addressHex.padStart(64, "0");
  const url = `${BASE}/wallet/triggerconstantcontract`;
  const payload = {
    contract_address: contractAddress,
    function_selector: "balanceOf(address)",
    parameter,
    owner_address: address,
    visible: true
  };

  return fetchJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers() },
    body: JSON.stringify(payload),
    ...options
  });
}

export async function getAccountTransactions(address, options = {}) {
  const params = new URLSearchParams({
    limit: "20",
    only_confirmed: "true",
    order_by: "block_timestamp,desc"
  });
  const url = `${BASE}/v1/accounts/${encodeURIComponent(address)}/transactions?${params.toString()}`;
  return fetchJson(url, { headers: headers(), ...options });
}

export async function createTransferTransaction(from, to, amountSun, options = {}) {
  const url = `${BASE}/wallet/createtransaction`;
  const payload = {
    owner_address: from,
    to_address: to,
    amount: Number(amountSun),
    visible: true
  };
  return fetchJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers() },
    body: JSON.stringify(payload),
    ...options
  });
}
