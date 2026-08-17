/**
 * Remote-key normalization for the TV kiosk.
 *
 * The kiosk understands exactly four gestures: left, right, select, back.
 * Every input path funnels into them — the Shield/Google TV D-pad, the touch
 * thirds on a panel, and (this file) whatever a USB HID remote decides to send.
 *
 * Why this exists (host 2026-08-17): the UniFi Display Cast Pro's HDMI-CEC is
 * OUTBOUND only — it powers the display on and off. It does not receive CEC
 * Remote Control Passthrough, so a TV remote cannot drive it over HDMI. The
 * documented input path on that player is the USB-C port: a keyboard or mouse.
 * That makes a $15 USB presenter clicker or air-mouse the practical remote for
 * a signage panel — but those send PageUp/PageDown/Space, not arrows.
 *
 * So: map the vocabulary those devices actually emit onto ours. Anything not
 * listed returns null and the kiosk ignores it, which keeps stray typing on an
 * attached keyboard from walking the deck.
 */

/** The only four things the kiosk can be told to do. */
export type RemoteKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown" | "Enter" | "Back";

/**
 * Translate a raw KeyboardEvent.key into a kiosk key, or null to ignore it.
 *
 * Deliberately NOT mapped:
 *  - F5 / BrowserRefresh — presenters send it; let the browser reload.
 *  - Tab — focus traversal, not navigation.
 *  - letters/digits — an attached keyboard shouldn't drive the deck.
 */
export function normalizeRemoteKey(key: string): RemoteKey | null {
  switch (key) {
    // D-pad, verbatim.
    case "ArrowLeft":
    case "ArrowRight":
    case "ArrowUp":
    case "ArrowDown":
      return key;
    case "Enter":
      return "Enter";

    // Back: browser, Android TV, and desktop spellings.
    case "Escape":
    case "Backspace":
    case "GoBack":
    case "BrowserBack":
      return "Back";

    // Presenter clickers (Logitech R400/R500 and every clone) send the slide
    // keys, not arrows. Forward = next slide, back = previous.
    case "PageDown":
    case "MediaTrackNext":
      return "ArrowRight";
    case "PageUp":
    case "MediaTrackPrevious":
      return "ArrowLeft";

    // Space is "advance/select" on nearly every presenter and media remote.
    case " ":
    case "Spacebar": // legacy spelling, still emitted by some HID firmware
    case "MediaPlayPause":
      return "Enter";

    default:
      return null;
  }
}
