const js = require("@eslint/js");
const globals = require("globals");
const react = require("eslint-plugin-react");
const reactHooks = require("eslint-plugin-react-hooks");
const {
  reactRefresh
} = require("eslint-plugin-react-refresh");
module.exports = [{
  ignores: ["dist/**", "node_modules/**", "eslint.config.js"]
}, js.configs.recommended, {
  files: ["**/*.{js,jsx}"],
  languageOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    parserOptions: {
      ecmaFeatures: {
        jsx: true
      }
    },
    globals: {
      ...globals.browser,
      ...globals.es2020
    }
  },
  settings: {
    react: {
      version: "detect"
    }
  },
  plugins: {
    react,
    "react-hooks": reactHooks,
    "react-refresh": reactRefresh.plugin
  },
  rules: {
    ...react.configs.flat.recommended.rules,
    "no-unused-vars": ["error", {
      argsIgnorePattern: "^_|^(e|err)$",
      caughtErrors: "none",
      varsIgnorePattern: "^_"
    }],
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "warn",
    ...reactRefresh.configs.vite.rules,
    "react/prop-types": "off",
    "react-refresh/only-export-components": ["warn", {
      allowConstantExport: true,
      allowExportNames: ["APP_ICON_SIZES", "useWorkspaceSession"]
    }]
  }
}, {
  files: ["src/hooks/**/*.{js,jsx}"],
  rules: {
    "react-refresh/only-export-components": "off"
  }
}];
