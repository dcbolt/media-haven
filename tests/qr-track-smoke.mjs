/**
 * QR attribution redirect unit fixtures — no browser required.
 */
import {
  appendQrUtm,
  coarseUaClass,
  feedbackPageUrl,
  isTestScanQuery,
  resolveScanDest,
  sanitizePropertyParam,
  sanitizeSlideId,
  sanitizeTvParam,
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

const goodTv = "11111111-1111-4111-8111-111111111111";
check(
  "trackedUrl adds property, tv, slide",
  (() => {
    const u = new URL(
      trackedUrl("book", "https://www.thefloridahavens.com/", {
        property: "shell-haven",
        tv: goodTv,
        slide: "book-direct",
      })
    );
    return (
      u.searchParams.get("property") === "shell-haven" &&
      u.searchParams.get("tv") === goodTv &&
      u.searchParams.get("slide") === "book-direct"
    );
  })()
);

check(
  "utm_content tv_slide",
  (() => {
    const out = appendQrUtm(
      "https://www.thefloridahavens.com/",
      "book",
      "turtle-haven",
      goodTv,
      "book-direct"
    );
    return new URL(out).searchParams.get("utm_content") === `${goodTv}_book-direct`;
  })()
);

check("coarse UA mobile", coarseUaClass("Mozilla/5.0 iPhone") === "mobile");
check(
  "isTestScanQuery t=1",
  isTestScanQuery(new URLSearchParams("t=1"), false)
);

check(
  "feedbackPageUrl carries params",
  feedbackPageUrl({
    property: "turtle-haven",
    tv: goodTv,
    slide: "guestbook-feedback",
  }).includes("slide=guestbook-feedback")
);

check(
  "sanitizeTvParam uuid only",
  sanitizeTvParam(goodTv) === goodTv && sanitizeTvParam("nope") === null
);

const failed = results.filter((r) => !r.pass);
process.exit(failed.length ? 1 : 0);