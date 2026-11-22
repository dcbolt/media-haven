#!/usr/bin/env node
/**
 * Reference on-site authorizer: verifies HMAC, calls UniFi authorize-guest.
 *
 * Env:
 *   NODE_AUTHORIZER_SECRET — shared with Vercel
 *   UNIFI_HOST, UNIFI_API_KEY
 *   UNIFI_SITE — default "default"
 *   PORT — default 8787
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import http from "node:http";

const SECRET = process.env.NODE_AUTHORIZER_SECRET ?? "";
const UNIFI_HOST = process.env.UNIFI_HOST ?? "127.0.0.1";
const UNIFI_API_KEY = process.env.UNIFI_API_KEY ?? "";
const UNIFI_SITE = process.env.UNIFI_SITE ?? "default";
const PORT = Number(process.env.PORT ?? 8787);

function verify(secret, timestamp, body, signatureHex) {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > 300) return false;
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`, "utf8")
    .digest("hex");
  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(signatureHex, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

async function authorizeGuest(mac, minutes) {
  if (!UNIFI_API_KEY) {
    console.warn("[wifi-authorizer] UNIFI_API_KEY unset — dry-run ok");
    return { ok: true, dryRun: true };
  }
  const url = `https://${UNIFI_HOST}/proxy/network/api/s/${UNIFI_SITE}/cmd/stamgr`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": UNIFI_API_KEY,
    },
    body: JSON.stringify({
      cmd: "authorize-guest",
      mac,
      minutes,
    }),
  });
  if (!res.ok) throw new Error(`unifi ${res.status}`);
  return { ok: true };
}

const server = http.createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/") {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  let body = "";
  req.on("data", (c) => {
    body += c;
  });
  req.on("end", async () => {
    try {
      if (!SECRET) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "secret not configured" }));
        return;
      }
      const ts = req.headers["x-timestamp"];
      const sig = req.headers["x-signature"];
      if (typeof ts !== "string" || typeof sig !== "string") {
        res.writeHead(401);
        res.end("missing signature");
        return;
      }
      if (!verify(SECRET, ts, body, sig)) {
        res.writeHead(401);
        res.end("bad signature");
        return;
      }
      const data = JSON.parse(body);
      const mac = data.mac;
      const minutes = Number(data.minutes) || 60;
      if (!mac) {
        res.writeHead(400);
        res.end("mac required");
        return;
      }
      const result = await authorizeGuest(mac, minutes);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    } catch (e) {
      console.error(e);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(e) }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`wifi-authorizer listening :${PORT}`);
});