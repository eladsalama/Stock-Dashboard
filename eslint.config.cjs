// ESLint v9 flat config (CommonJS variant for Node without type:module)
// Docs: https://eslint.org/docs/latest/use/configure/configuration-files-new

const tseslint = require("typescript-eslint");

module.exports = [
  {
    ignores: ["dist/**", "node_modules/**", "docs/**", ".env", "eslint.config.cjs"],
  },
  // Apply TypeScript recommended rules to TS files only
  ...tseslint.configs.recommended.map((cfg) => ({
    ...cfg,
    files: ["**/*.ts"],
  })),
  {
    files: ["**/*.ts"],
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-require-imports": "off",
    },
  },
];