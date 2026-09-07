import { file, type TemplateFile } from "../shared.js";
import type { ResolvedDesignSystemApp, ResolvedUiLayout } from "./layout.js";

function brandWordmarkContent(native: boolean): string {
  if (native)
    return `import type * as React from "react";
import { Text } from "react-native";

export function BrandWordmark(): React.JSX.Element {
  return <Text accessibilityLabel="GhostInit" className="shrink-0 text-[15px] font-semibold tracking-tight"><Text className="text-primary">Ghost</Text><Text className="text-secondary-foreground">Init</Text></Text>;
}
`;
  return `import type * as React from "react";

export function BrandWordmark(): React.JSX.Element {
  return <span dir="ltr" className="inline-flex shrink-0 items-baseline whitespace-nowrap text-[15px] font-semibold tracking-tight"><span className="text-primary">Ghost</span><span className="text-secondary-foreground">Init</span></span>;
}
`;
}

export function brandRendererFiles(
  layout: ResolvedUiLayout,
  apps: readonly ResolvedDesignSystemApp[],
): TemplateFile[] {
  return apps.map((app) => {
    const sourceRoot =
      layout.mode === "monorepo"
        ? `apps/${app.id}/src${app.target === "electron" ? "/renderer" : ""}`
        : "src";
    return file(
      `${sourceRoot}/components/brand-wordmark.tsx`,
      brandWordmarkContent(app.target === "expo"),
    );
  });
}
