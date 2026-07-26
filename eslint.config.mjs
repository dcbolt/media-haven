import { createRequire } from "module";

// eslint-config-next ≥15 exports a flat Config[] (CJS). createRequire keeps
// the import stable under Node ESM without FlatCompat (which circular-crashes
// on the new next/typescript shareable config).
const require = createRequire(import.meta.url);
/** @type {import("eslint").Linter.Config[]} */
const nextCoreWebVitals = require("eslint-config-next/core-web-vitals");
/** @type {import("eslint").Linter.Config[]} */
const nextTypescript = require("eslint-config-next/typescript");

/** @type {import("eslint").Linter.Config[]} */
const config = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "out/**",
      "supabase/**",
      "lib/migrations.generated.ts",
    ],
  },
];

export default config;
