/**
 * Fleet TV card — sanitized report meta lines (shared by /host/tvs + smoke).
 */

import React from "react";
import { sanitizeReportDisplayText } from "./tv-device-report-display.ts";

export type FleetReportMetaDisplayProps = {
  mode: string | null;
  foregroundHint: string | null;
  appVersion: string | null;
  appBuild: string | null;
  firmware: string | null;
  feedLastOkAt: string | null;
  feedLastError: string | null;
  feedUsingLastGood: boolean | null;
  lastErrors: { code: string; msg: string }[];
};

export function FleetReportMetaDisplay(props: FleetReportMetaDisplayProps) {
  const {
    mode,
    foregroundHint,
    appVersion,
    appBuild,
    firmware,
    feedLastOkAt,
    feedLastError,
    feedUsingLastGood,
    lastErrors,
  } = props;
  const hasMeta = Boolean(mode || foregroundHint || appVersion);
  const hasFeed = Boolean(
    feedLastError || feedUsingLastGood || feedLastOkAt
  );
  const hasErr = lastErrors.length > 0;

  if (!hasMeta && !hasFeed && !hasErr) return null;

  return React.createElement(
    React.Fragment,
    null,
    hasMeta
      ? React.createElement(
          "p",
          {
            className: "mt-1 text-xs text-ocean-900/55",
            "data-fleet-report-meta": "1",
          },
          mode
            ? React.createElement(
                "span",
                { className: "mr-2" },
                "mode ",
                React.createElement(
                  "span",
                  { className: "font-mono" },
                  sanitizeReportDisplayText(mode, 40)
                )
              )
            : null,
          foregroundHint
            ? React.createElement(
                "span",
                { className: "mr-2" },
                "fg hint ",
                React.createElement(
                  "span",
                  { className: "font-mono" },
                  sanitizeReportDisplayText(foregroundHint, 24)
                )
              )
            : null,
          appVersion
            ? React.createElement(
                "span",
                { className: "mr-2" },
                `app ${sanitizeReportDisplayText(appVersion, 40)}`,
                appBuild
                  ? ` (${sanitizeReportDisplayText(appBuild, 40)})`
                  : ""
              )
            : null,
          firmware
            ? React.createElement(
                "span",
                { className: "mr-2" },
                `fw ${sanitizeReportDisplayText(firmware, 80)}`
              )
            : null
        )
      : null,
    hasFeed
      ? React.createElement(
          "p",
          { className: "mt-1 text-xs text-ocean-900/50" },
          "Feed ",
          feedLastOkAt ? `ok ${feedLastOkAt}` : "—",
          feedUsingLastGood ? " · cached last-good" : "",
          feedLastError
            ? ` · err ${sanitizeReportDisplayText(feedLastError, 80)}`
            : ""
        )
      : null,
    hasErr
      ? React.createElement(
          "p",
          { className: "mt-1 text-xs text-red-700/80" },
          "Last error: ",
          sanitizeReportDisplayText(lastErrors[0]?.code ?? "", 64),
          " ",
          sanitizeReportDisplayText(lastErrors[0]?.msg ?? "", 100)
        )
      : null
  );
}
