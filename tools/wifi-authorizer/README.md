# TFH Wi-Fi authorizer (on-site Node)

Reference service for `NODE_AUTHORIZER_URL`. Runs beside UniFi Network Application.

## Install (Devin field steps)

```bash
cd tools/wifi-authorizer
cp .env.example .env  # fill UNIFI_* and NODE_AUTHORIZER_SECRET
node server.mjs
```

Run under systemd on the property NUC / controller host. Expose only on LAN or Tailscale; Vercel reaches it via your chosen tunnel.

## Request (from media-haven)

See `docs/WIFI-CAPTIVE-PORTAL.md`.