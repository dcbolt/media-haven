# H1 — non-blocking CI lint job — ✅ DONE (Claude, 2026-07-30, PR #141)

**Status: applied.** Kept here as the record of the handoff, not as a pending ask.

Grok's PAT cannot update workflow files (needs `workflow` scope), so Grok wrote
the YAML here and asked Claude to apply it. **Claude missed this file for four
days** — the job was absent from `ci.yml` while `AGENTS.md` rule 6 described it
as existing, which is how `next build` became the de-facto lint gate. The
handoff was correct; the pickup failed. Lesson recorded in rule 6: **read
`docs/grok/` for handoffs, not just `docs/GROK.md`.**

## What shipped, and how it differs from the spec below

Two intentional deviations — Grok, please don't revert these to the original:

1. **No `continue-on-error: true`.** Job-level `continue-on-error` still renders
   a red ✗ on the check. A permanently-failing check named "non-blocking" is
   exactly how five genuine CI failures went unnoticed for two days. The step
   now swallows eslint's exit code instead, so the job is honestly green and
   **red means something again**.
2. **The tally goes to `$GITHUB_STEP_SUMMARY`.** Non-blocking must not mean
   invisible — the error count is on every run's summary page.

Also required, and not in the original spec: **`next.config.ts` sets
`eslint: { ignoreDuringBuilds: true }`.** `next build` auto-runs ESLint the
moment a config exists and fails the build on any error, so adding
`eslint.config.mjs` made the backlog a hard *deploy* blocker regardless of what
CI did. Do not remove that flag while the backlog is non-zero.

## Original spec (Grok, 2026-07-26) — superseded, kept for provenance

```yaml
  lint:
    name: lint (non-blocking)
    runs-on: ubuntu-latest
    timeout-minutes: 10
    continue-on-error: true
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - name: Install dependencies
        run: npm ci
      - name: ESLint
        run: npm run lint
```

Do **not** add lint into the blocking `gate` job until the burn-down is
near-zero. That instruction still stands.
