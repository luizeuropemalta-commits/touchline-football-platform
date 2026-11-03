import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // This audit entry is loaded by the isolated CommonJS browser bundler.
    // Keep the exemption exact; application modules retain the import rule.
    files: ["artifacts/avatar-notifications-20261031/vip-score-browser-fixture-20261101.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    rules: {
      "@next/next/no-html-link-for-pages": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    ".codex-quarantine/**",
    "node_modules/**",
    "outputs/**",
    "work/**",
    "TOUCHLINE_VISUAL_AUDIT_*/**",
  ]),
]);
