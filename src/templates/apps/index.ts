import { apiFiles } from "./api.js";
import { componentFiles } from "./components.js";
import { coreFiles } from "./core.js";
import { pageFiles } from "./pages.js";
import { testFiles } from "./tests.js";
import type { TemplateFile } from "../shared.js";

export function appsFiles(runtime: "node" | "bun" = "bun"): TemplateFile[] {
  return [
    ...coreFiles(runtime),
    ...pageFiles(),
    ...apiFiles(),
    ...componentFiles(),
    ...testFiles(runtime),
  ];
}
