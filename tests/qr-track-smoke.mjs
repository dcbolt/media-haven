/**
 * QR attribution redirect unit fixtures — no browser required.
 */
import {
  appendQrUtm,
  coarseUaClass,
  feedbackPageUrl,
  isScanBotUserAgent,
  isTestScanQuery,
  resolveScanDest,
  sanitizeAttributionTag,
  sanitizePropertyParam,
  sanitizeSlideId,
  trackedUrl,
} from "../lib/qr-attribution-core.ts";

const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass });
  const line = `${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`;
  console.log(line);
}

check(
  "fixed slug story ignores evil to",
  resolveScanDest("story", "https://evil.com/x")?.includes("guest-story"),
  resolveScanDest("story", "https://evil.com/x") ?? ""
);

check(
  "feedback slug opens feedback page",
  resolveScanDest("feedback", null, {
    property: "turtle-haven",
    slide: "guestbook-feedback",
  })?.includes("/feedback")
);

check(
  "dynamic slug blocks evil host",
  resolveScanDest("book", "https://evil.com/") === null
);

check(
  "property + slide sanitization",
  sanitizePropertyParam("turtle-haven") === "turtle-haven" &&
    sanitizeSlideId("guestbook-review") === "guestbook-review" &&
    sanitizeSlideId("../") === null
);

const goodTag = "abcdef012345";
check(
  "trackedUrl adds property, tag, slide (never tv uuid)",
  (() => {
    const u = new URL(
      trackedUrl("book", "https://www.thefloridahavens.com/", {
        property: "shell-haven",
        tag: goodTag,
        slide: "book-direct",
      })
    );
    return (
      u.searchParams.get("property") === "shell-haven" &&
      u.searchParams.get("tag") === goodTag &&
      u.searchParams.get("tv") === null &&
      u.searchParams.get("slide") === "book-direct"
    );
  })()
);

check(
  "utm_content uses tag not device uuid",
  (() => {
    const out = appendQrUtm(
      "https://www.thefloridahavens.com/",
      "book",
      "turtle-haven",
      goodTag,
      "book-direct"
    );
    const content = new URL(out).searchParams.get("utm_content");
    return content === `${goodTag}_book-direct` && !content.includes("11111111");
  })()
);

check("coarse UA mobile", coarseUaClass("Mozilla/5.0 iPhone") === "mobile");
check("scan bot UA", isScanBotUserAgent("Twitterbot/1.0"));
check(
  "isTestScanQuery ignores t=1",
  !isTestScanQuery(new URLSearchParams("t=1"), false) &&
    isTestScanQuery(new URLSearchParams(), true)
);

check(
  "feedbackPageUrl carries tag params",
  feedbackPageUrl({
    property: "turtle-haven",
    tag: goodTag,
    slide: "guestbook-feedback",
  }).includes("tag=") &&
    !feedbackPageUrl({
      property: "turtle-haven",
      tag: goodTag,
      slide: "guestbook-feedback",
    }).includes("tv=")
);

check(
  "sanitizeAttributionTag",
  sanitizeAttributionTag(goodTag) === goodTag &&
    sanitizeAttributionTag("nope") === null
);

const failed = results.filter((r) => !r.pass);
process.exit(failed.length ? 1 : 0);