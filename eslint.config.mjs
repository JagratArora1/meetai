import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // React Compiler rules added in eslint-plugin-react-hooks v7 (via eslint-config-next 16).
    // They flag existing, working patterns (Stream client setup in effects, shadcn hooks),
    // so keep them visible as warnings rather than failing lint.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Standalone CommonJS debug scripts run with plain Node, not part of the app.
    "debug-*.js",
  ]),
]);

export default eslintConfig;
