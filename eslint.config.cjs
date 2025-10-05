// ESLint v9 flat config (CommonJS variant for Node without type:module)
// Docs: https://eslint.org/docs/latest/use/configure/configuration-files-new

const tseslint = require("typescript-eslint");

module.exports = [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "docs/**",
      ".env",
      "eslint.config.cjs",
      ".next/**",
      "web/.next/**",
      "web/node_modules/**"
    ],
  },
  // Apply TypeScript recommended rules to TS files only
  ...tseslint.configs.recommended.map((cfg) => ({
    ...cfg,
    files: ["**/*.ts", "**/*.tsx"],
  })),
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-require-imports": "off",
    },
  },
];