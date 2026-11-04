// Lint for the dictionary app and pipeline: TypeScript's recommended rules plus React's hooks rules,
// which the eslint-disable react-hooks/exhaustive-deps comments in app/ and components/ assume.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts", "**/.claude/**", "pipeline/**/output/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  {
    rules: {
      // The React Compiler rules in the v7 preset flag the deliberate "latest value in a ref"
      // pattern in SearchApp; keep them visible as warnings, not merge-blocking.
      "react-hooks/refs": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/set-state-in-effect": "warn",
      // Storage access is wrapped in try/catch {} on purpose (private mode, blocked storage).
      "no-empty": ["error", { allowEmptyCatch: true }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // Gurmukhi classes such as [ਅ-ਹਾ-ੌ] list vowel signs on purpose: each sign is matched as its
      // own code point, which is what the tokenizer, folds and parsers want.
      "no-misleading-character-class": "off",
    },
  },
  {
    // Node scripts run outside the bundler.
    files: ["**/*.mjs"],
    languageOptions: { globals: { process: "readonly", console: "readonly", URL: "readonly", Buffer: "readonly" } },
  },
  {
    // One-off ingest scripts and test doubles; app code (app/, components/, lib/) stays strict.
    files: ["pipeline/**", "tests/**"],
    rules: { "@typescript-eslint/no-explicit-any": "warn" },
  },
);
