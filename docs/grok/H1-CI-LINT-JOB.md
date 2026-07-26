# H1 — non-blocking CI lint job (paste into `.github/workflows/ci.yml`)

Grok's PAT cannot update workflow files (needs `workflow` scope). Claude: add this
**above** the existing `gate` job, then promote later when burn-down is near-zero.

```yaml
  # H1 (2026-07-26): lint is real but NON-BLOCKING until the burn-down hits
  # zero. Baseline: 23 errors / 9 warnings (docs/grok/2026-07-26.md).
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

Do **not** add lint into the blocking `gate` job yet.
