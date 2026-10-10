import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  { ignores: ["**/node_modules/**", "**/dist/**", "**/coverage/**", "**/.vite/**"] },

  js.configs.recommended,

  // API (Node, ES modules)
  {
    files: ["apps/api/**/*.js"],
    languageOptions: { ecmaVersion: 2023, sourceType: "module", globals: { ...globals.node } },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["apps/api/tests/**/*.js"],
    languageOptions: { globals: { ...globals.node, ...globals.jest } },
  },

  // Web (React in the browser)
  {
    files: ["apps/web/**/*.{js,jsx}"],
    plugins: { react, "react-hooks": reactHooks },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: "18.3" } },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs["jsx-runtime"].rules,
      ...reactHooks.configs.recommended.rules,
      "react/prop-types": "off",
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["apps/web/**/*.test.{js,jsx}", "apps/web/src/test/**"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    files: ["apps/web/vite.config.js"],
    languageOptions: { globals: { ...globals.node } },
  },
];
