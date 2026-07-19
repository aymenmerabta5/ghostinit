import { stripePanelContent } from "./providers/stripe.js";
import { chargilyPanelContent } from "./providers/chargily.js";
import { paddlePanelContent } from "./providers/paddle.js";
import { polarPanelContent } from "./providers/polar.js";

export function providerPanelContent(provider: string, hookImportPath: string): string {
  switch (provider) {
    case "stripe":
      return stripePanelContent(hookImportPath);
    case "chargily":
      return chargilyPanelContent(hookImportPath);
    case "paddle":
      return paddlePanelContent(hookImportPath);
    case "polar":
      return polarPanelContent(hookImportPath);
    default:
      return "";
  }
}

export { stripePanelContent, chargilyPanelContent, paddlePanelContent, polarPanelContent };
