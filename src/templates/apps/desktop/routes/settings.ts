import type { DesktopMode } from "../model.js";
import { desktopSettingsRouteContent } from "../../fragments/settings/native-desktop.js";
export function desktopRouteSettingsContent(
  _hasBilling = true,
  _hasEmail = true,
  _hasI18n = false,
  mode: DesktopMode = "monorepo",
): string {
  return desktopSettingsRouteContent(mode);
}
