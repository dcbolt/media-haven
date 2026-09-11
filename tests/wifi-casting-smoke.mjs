/**
 * Guest-copy rewrite for the Wi-Fi & Casting slide. No browser — proves
 * Shield / Google TV never survive load, and unrelated sections pass through.
 * Blast radius: lib/content.ts helpers only.
 */
import {
  guestSafeSection,
  isWifiCastingSection,
  WIFI_CASTING_BODY,
} from "../lib/content.ts";

function row(name, pass, detail = "") {
  console.log(JSON.stringify({ name, pass, detail }));
}

const dirty = {
  slug: "wifi-tips",
  title: "Wi-Fi & Casting",
  body: "Prefer your own accounts on the Shield / Google TV.",
  showOnTv: true,
};
const titled = {
  slug: "custom",
  title: "WiFi & Casting tips",
  body: "Shield box",
  showOnTv: true,
};
const beach = {
  slug: "beach",
  title: "The Beach",
  body: "sand",
  showOnTv: true,
};

row("wifi-casting slug match", isWifiCastingSection(dirty));
row("wifi-casting title match", isWifiCastingSection(titled));
row("wifi-casting ignores other sections", !isWifiCastingSection(beach));
const cleaned = guestSafeSection(dirty);
row(
  "wifi-casting rewrite drops streamer brands",
  cleaned.body === WIFI_CASTING_BODY && !/Shield|Google TV/i.test(cleaned.body)
);
row(
  "wifi-casting rewrite leaves other bodies",
  guestSafeSection(beach).body === "sand"
);
