import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Copied into public/ automatically by `next build` because of the
    // `new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url)` reference
    // in components/TextbookPage.tsx — it's a vendored build artifact, not source.
    "public/pdf.worker.min.mjs",
  ]),
]);

export default eslintConfig;
