import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * Flat ESLint config for tothemoon (TypeScript + Vite).
 * Scope: src/, scripts/. dist/ and node_modules/ are ignored.
 */
export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "public/**"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts", "scripts/**/*.ts"],
    languageOptions: {
      parserOptions: {
        // Project service is optional; keep lint fast without type-aware rules.
        ecmaVersion: 2022,
        sourceType: "module",
      },
    },
    rules: {
      // Prefer `type` imports for erased types (matches tsconfig verbatimModuleSyntax intent).
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "separate-type-imports" },
      ],
      // Allow unused vars prefixed with `_` (scratch / intentional discards).
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      // Empty catch blocks and intentional empty interfaces are rare; keep strict.
      "@typescript-eslint/no-explicit-any": "error",
      // Prefer const; let is fine when reassigned.
      "prefer-const": "error",
      "no-var": "error",
      "eqeqeq": ["error", "smart"],
      "no-throw-literal": "error",
    },
  },
  // node:test suites — slightly looser on unused helpers during WIP tests.
  {
    files: ["src/**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
);
