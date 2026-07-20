# media-haven — Hardware standard (Grok review 2026-07-20)

**Status:** RECOMMENDED standard — aligns with [`DECISIONS.md`](./DECISIONS.md).  
**Audience:** Devin, Claude, installers.  
**Related:** [`ENTERTAINMENT.md`](./ENTERTAINMENT.md) · [`STREAMING-SEAMLESS.md`](./STREAMING-SEAMLESS.md)

---

## Product requirements (all-in-one box)

| Need | Why |
|------|-----|
| One HDMI forever | Guest never hunts inputs |
| Real browser / kiosk | Boot + idle = `/tv` |
| Native Netflix / Disney+ / Prime / Plex / YouTube | Phone QR / device-code login lives **inside** those apps |
| Launch app from guide | Android `intent://…package=` from Fully Kiosk |
| Back → `/tv` | Kiosk underlay |
| Cast receiver | Phone Path B (`{Room} · {Property}`) |
| Ethernet preferred | Always-on villa reliability |

---

## Portfolio standard (buy list)

### Living room (primary entertainment) — pick ONE primary SKU

| Rank | Device | Role |
|------|--------|------|
| **#1** | **NVIDIA Shield TV Pro** (2019) | Best all-in-one: kiosk + intents + Ethernet + headroom |
| **#1 modern alt** | **Google TV Streamer 4K** | Google-current stack + Ethernet; **pilot one villa 2 weeks** before fleet |

### Bedrooms / spares

| Device | Notes |
|--------|--------|
| **Onn 4K Pro** (Google TV + Ethernet) | Budget same-OS family |
| Chromecast w/ Google TV 4K | OK if + Ethernet adapter |

### Per living-room install

- Fully Kiosk Browser **Plus**
- Ethernet to UniFi switch (not Wi‑Fi-only for primary)
- Thin HDMI, Velcro mount, spare Bluetooth remote
- Cast name: `{Room} · {Property}` (e.g. `Living · Turtle Haven`)
- Host Google account on device for Play Store only (not guest accounts)

### UniFi network (always)

UDM / APs / switching / guest VLAN — **network plane**, not entertainment SoC.

---

## UniFi Display Cast Pro (UC-Cast-Pro) — decision

**Product:** [Display Cast Pro](https://store.ui.com/us/en/category/premium-iot/products/uc-cast-pro) (~$279)  
Managed **digital signage** player: HDMI, 4K, PoE, Web Mode (load URL), UniFi Connect fleet.

| Media Haven need | Cast Pro? |
|------------------|-----------|
| Boot `/tv` guide | **Yes** (Web Mode) |
| Native Netflix / Disney / Prime apps | **No** |
| Intent launch from Entertainment grid | **No** |
| Guest TV QR login into Netflix on that stick | **No** |
| Chromecast cast target | **No** (name is brand, not Google Cast) |

### Verdict

| Use Cast Pro for | Do **not** use for |
|------------------|--------------------|
| Pool / foyer / vacant drone loop | Guest living-room entertainment |
| Back-of-house roadmap board | “All-in-one Stay OS” |
| Pure signage Web Mode | Dual-HDMI with Shield (rejected) |

**Optional later:** CMS `deviceClass: streamer | signage` — signage hides Entertainment intents, shows phone-first cast/portal coaching only.

---

## Explicit rejects

| Hardware | Killer flaw |
|----------|-------------|
| Roku | No real browser for `/tv` |
| Fire TV | Weak Fully / intent surface |
| Apple TV | No Android intent path from web guide |
| Smart-TV-only apps | No fleet kiosk standard |
| Dual HDMI (Cast Pro + streamer) | Breaks one-input forever |

---

## Acceptance test (before bulk buy)

On candidate living-room box:

1. Fully boots to `/tv?device=…` after power loss  
2. 72h uptime, never blank (last-good cache)  
3. Entertainment → Netflix **intent** opens app, same HDMI  
4. Back → `/tv` within ~2s  
5. Guest phone completes Netflix QR login  
6. Cast from phone shows `Living · {Property}`  
7. Disney+, Prime, YouTube, Plex same path  
8. Turnover sign-out leaves next guest clean  

Fail on 3–4 → wrong SKU for all-in-one.

---

## Fully Kiosk (streamer class only)

- Start URL: production `/tv?device=<uuid>`  
- Start on boot, keep screen on, reload 4–6h or ~4am  
- **Allow external intents / open apps** (required for Entertainment)  
- PIN lockdown for settings  

Hardware validation of intents on physical Shield remains a **Devin** item (see ENTERTAINMENT open ops).

---

## History

| Date | Note |
|------|------|
| 2026-07-16 | DECISIONS lock: Shield living / GTV bedrooms |
| 2026-07-20 | Grok deep review: Cast Pro = signage only; Shield still #1 all-in-one; Streamer = modern alt; Onn = budget fleet |
