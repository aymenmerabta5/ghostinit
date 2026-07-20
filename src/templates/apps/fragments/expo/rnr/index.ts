import { file, type TemplateFile } from "../../../../shared.js";
import { rnrTextContent } from "./text.js";
import { rnrButtonContent } from "./button.js";
import { rnrCardContent } from "./card.js";
import { rnrInputContent } from "./input.js";
import { rnrLabelContent } from "./label.js";
import { rnrBadgeContent } from "./badge.js";
import { rnrAvatarContent } from "./avatar.js";
import { rnrTabsContent } from "./tabs.js";

export function rnrCoreFiles(): TemplateFile[] {
  return [
    file("apps/mobile/src/components/ui/text.tsx", rnrTextContent()),
    file("apps/mobile/src/components/ui/button.tsx", rnrButtonContent()),
  ];
}

export function rnrExtendedFiles(): TemplateFile[] {
  return [
    file("apps/mobile/src/components/ui/card.tsx", rnrCardContent()),
    file("apps/mobile/src/components/ui/input.tsx", rnrInputContent()),
    file("apps/mobile/src/components/ui/label.tsx", rnrLabelContent()),
    file("apps/mobile/src/components/ui/badge.tsx", rnrBadgeContent()),
    file("apps/mobile/src/components/ui/avatar.tsx", rnrAvatarContent()),
    file("apps/mobile/src/components/ui/tabs.tsx", rnrTabsContent()),
  ];
}

export function rnrAllFiles(): TemplateFile[] {
  return [...rnrCoreFiles(), ...rnrExtendedFiles()];
}
