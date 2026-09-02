import { standaloneWebGlobalCssContent } from "../../../apps/fragments/css.js";

/** Single web uses the same semantic-theme renderer as the package UI module. */
export function singleGlobalsCss(): string {
  return standaloneWebGlobalCssContent();
}

export function singlePostCss(): string {
  return [
    '/** @type {import("postcss-load-config").Config} */',
    "const config = {",
    "  plugins: {",
    '    "@tailwindcss/postcss": {},',
    "  },",
    "};",
    "",
    "export default config;",
    "",
  ].join("\n");
}
