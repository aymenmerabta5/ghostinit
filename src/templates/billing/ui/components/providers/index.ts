import { stripePanelContent } from "./stripe.js";
import { chargilyPanelContent } from "./chargily.js";
import { paddlePanelContent } from "./paddle.js";
import { polarPanelContent } from "./polar.js";

export { stripePanelContent, chargilyPanelContent, paddlePanelContent, polarPanelContent };

export function providerPanelContent(provider: string, _hookImportPath: string): string {
  switch (provider) {
    case "stripe":
      return stripePanelContent(_hookImportPath);
    case "chargily":
      return chargilyPanelContent(_hookImportPath);
    case "paddle":
      return paddlePanelContent(_hookImportPath);
    case "polar":
      return polarPanelContent(_hookImportPath);
    default:
      return "";
  }
}
