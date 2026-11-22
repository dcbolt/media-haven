import type { NowPlaying } from "@/lib/tv-now-playing";
import type { TvDeviceRow } from "@/lib/tv";

const now = Date.now();
const recent = new Date(now - 15_000).toISOString();
const stale = new Date(now - 3600_000).toISOString();

export const FIXTURE_PROPERTIES = [
  { id: "fix-turtle", name: "Turtle Haven - Anna Maria" },
  { id: "fix-shell", name: "Shell Haven - Longboat Key" },
  { id: "fix-dunes", name: "The Dunes - Siesta" },
] as const;

export const FIXTURE_DEVICES: TvDeviceRow[] = [
  {
    id: "11111111-1111-1111-1111-111111111101",
    label: "Living · Turtle Haven",
    pair_code: "TH-LV01",
    property_id: "fix-turtle",
    property_name: FIXTURE_PROPERTIES[0].name,
    claimed_at: recent,
    last_seen: recent,
    occupied: true,
    guest_label: "Jordan",
    joined_name: null,
    joined_property_id: null,
  },
  {
    id: "11111111-1111-1111-1111-111111111102",
    label: "Master · Turtle Haven",
    pair_code: "TH-MB02",
    property_id: "fix-turtle",
    property_name: FIXTURE_PROPERTIES[0].name,
    claimed_at: recent,
    last_seen: recent,
    occupied: true,
    guest_label: "Jordan",
    joined_name: null,
    joined_property_id: null,
  },
  {
    id: "11111111-1111-1111-1111-111111111103",
    label: "Pool · Turtle Haven",
    pair_code: "TH-PL03",
    property_id: "fix-turtle",
    property_name: FIXTURE_PROPERTIES[0].name,
    claimed_at: recent,
    last_seen: recent,
    occupied: true,
    guest_label: "Jordan",
    joined_name: null,
    joined_property_id: null,
  },
  {
    id: "11111111-1111-1111-1111-111111111104",
    label: "Kitchen · Turtle Haven",
    pair_code: "TH-KT04",
    property_id: "fix-turtle",
    property_name: FIXTURE_PROPERTIES[0].name,
    claimed_at: recent,
    last_seen: stale,
    occupied: true,
    guest_label: "Jordan",
    joined_name: null,
    joined_property_id: null,
  },
  {
    id: "11111111-1111-1111-1111-111111111105",
    label: "Den · Turtle Haven",
    pair_code: "TH-DN05",
    property_id: "fix-turtle",
    property_name: FIXTURE_PROPERTIES[0].name,
    claimed_at: recent,
    last_seen: recent,
    occupied: true,
    guest_label: "Jordan",
    joined_name: null,
    joined_property_id: null,
  },
  {
    id: "11111111-1111-1111-1111-111111111106",
    label: "Guest · Turtle Haven",
    pair_code: "TH-GU06",
    property_id: "fix-turtle",
    property_name: FIXTURE_PROPERTIES[0].name,
    claimed_at: recent,
    last_seen: recent,
    occupied: true,
    guest_label: "Jordan",
    joined_name: null,
    joined_property_id: null,
  },
  {
    id: "22222222-2222-2222-2222-222222222201",
    label: "Living · Shell Haven",
    pair_code: "SH-LV01",
    property_id: "fix-shell",
    property_name: FIXTURE_PROPERTIES[1].name,
    claimed_at: recent,
    last_seen: recent,
    occupied: false,
    guest_label: null,
    joined_name: null,
    joined_property_id: null,
  },
  {
    id: "22222222-2222-2222-2222-222222222202",
    label: "Master · Shell Haven",
    pair_code: "SH-MB02",
    property_id: "fix-shell",
    property_name: FIXTURE_PROPERTIES[1].name,
    claimed_at: recent,
    last_seen: recent,
    occupied: false,
    guest_label: null,
    joined_name: null,
    joined_property_id: null,
  },
  {
    id: "22222222-2222-2222-2222-222222222203",
    label: "Lanai · Shell Haven",
    pair_code: "SH-LN03",
    property_id: "fix-shell",
    property_name: FIXTURE_PROPERTIES[1].name,
    claimed_at: recent,
    last_seen: recent,
    occupied: false,
    guest_label: null,
    joined_name: null,
    joined_property_id: null,
  },
  {
    id: "33333333-3333-3333-3333-333333333301",
    label: "Office wall",
    pair_code: "DU-SG01",
    property_id: "fix-dunes",
    property_name: FIXTURE_PROPERTIES[2].name,
    claimed_at: recent,
    last_seen: recent,
    occupied: false,
    guest_label: null,
    joined_name: null,
    joined_property_id: null,
  },
  {
    id: "44444444-4444-4444-4444-444444444401",
    label: null,
    pair_code: "PAIR-9X2K",
    property_id: null,
    property_name: null,
    claimed_at: null,
    last_seen: recent,
    occupied: null,
    guest_label: null,
    joined_name: null,
    joined_property_id: null,
  },
  {
    id: "44444444-4444-4444-4444-444444444402",
    label: "Spare streamer",
    pair_code: "PAIR-7M4P",
    property_id: null,
    property_name: null,
    claimed_at: null,
    last_seen: stale,
    occupied: null,
    guest_label: null,
    joined_name: null,
    joined_property_id: null,
  },
  {
    id: "44444444-4444-4444-4444-444444444403",
    label: null,
    pair_code: "PAIR-3Q8W",
    property_id: null,
    property_name: null,
    claimed_at: null,
    last_seen: recent,
    occupied: null,
    guest_label: null,
    joined_name: null,
    joined_property_id: null,
  },
];

export function fixtureNowPlayingMap(): Map<string, NowPlaying> {
  const guest: NowPlaying = {
    mode: "guest",
    headline: "Guest stay · Beach day rotation",
    detail: "welcome → beach-day → streaming",
  };
  const vacant: NowPlaying = {
    mode: "vacant",
    headline: "Vacant amenity · Sea turtles loop",
    detail: "4 slides · afternoon",
  };
  const unlinked: NowPlaying = {
    mode: "unlinked",
    headline: "Pairing code",
    detail: null,
  };
  const map = new Map<string, NowPlaying>();
  for (const d of FIXTURE_DEVICES) {
    if (!d.property_id) map.set(d.id, unlinked);
    else if (d.occupied) map.set(d.id, guest);
    else map.set(d.id, vacant);
  }
  return map;
}