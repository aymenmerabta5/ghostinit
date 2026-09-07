import { file, type TemplateFile } from "../shared.js";
import type { ResolvedUiLayout } from "./layout.js";

const sharedComponents = [
  ["action.button", "button", ["Button"], "@base-ui/react/button", "react-native/Pressable"],
  [
    "surface.card",
    "card",
    ["Card", "CardContent", "CardHeader", "CardTitle"],
    "react",
    "react-native/View",
  ],
  ["status.badge", "badge", ["Badge"], "react", "react-native/View"],
  [
    "feedback.alert",
    "alert",
    ["Alert", "AlertDescription", "AlertTitle"],
    "react",
    "react-native/View",
  ],
  [
    "identity.avatar",
    "avatar",
    ["Avatar", "AvatarFallback", "AvatarImage"],
    "@base-ui/react/avatar",
    "react-native/View",
  ],
  ["form.input", "input", ["Input"], "react", "react-native/TextInput"],
  ["form.label", "label", ["Label"], "react", "react-native/Text"],
  [
    "navigation.tabs",
    "tabs",
    ["Tabs", "TabsContent", "TabsList", "TabsTrigger"],
    "@base-ui/react/tabs",
    "react-native/Pressable",
  ],
  [
    "overlay.dialog",
    "dialog",
    ["Dialog", "DialogContent", "DialogTitle"],
    "@base-ui/react/dialog",
    "react-native/Modal",
  ],
  ["layout.separator", "separator", ["Separator"], "@base-ui/react/separator", "react-native/View"],
  ["loading.skeleton", "skeleton", ["Skeleton"], "react", "react-native/View"],
] as const;

const webOnlyComponents = [
  ["feedback.toast", "sonner", ["Toaster"], "sonner"],
  ["feedback.empty", "empty", ["Empty", "EmptyDescription", "EmptyTitle"], "react"],
  ["data.table", "table", ["Table", "TableBody", "TableCell", "TableRow"], "react"],
  ["form.select", "select", ["Select", "SelectContent", "SelectItem"], "@base-ui/react/select"],
] as const;

function applicableMapping(
  implementation: "shadcn-base-ui" | "react-native-reusables",
  component: string,
  exports: readonly string[],
  primitive: string,
): Record<string, unknown> {
  return {
    status: "applicable",
    implementation,
    importPattern: `@/components/ui/${component}`,
    primitive,
    exports: [...exports],
  };
}

function inapplicableMapping(rationale: string): Record<string, unknown> {
  return { status: "inapplicable", rationale };
}

export function componentRegistry(): Record<string, unknown> {
  const components: Record<string, unknown>[] = sharedComponents.map(
    ([id, component, exports, primitive, nativePrimitive]) => ({
      id,
      category: id.split(".")[0],
      semanticImport: component,
      targets: {
        web: applicableMapping("shadcn-base-ui", component, exports, primitive),
        electron: applicableMapping("shadcn-base-ui", component, exports, primitive),
        native: applicableMapping("react-native-reusables", component, exports, nativePrimitive),
      },
      requiredStates: ["default", "hover", "focus", "active", "disabled"],
      fixtures: [`component.${id}.v1`],
    }),
  );

  for (const [id, component, exports, primitive] of webOnlyComponents) {
    components.push({
      id,
      category: id.split(".")[0],
      semanticImport: component,
      targets: {
        web: applicableMapping("shadcn-base-ui", component, exports, primitive),
        electron: applicableMapping("shadcn-base-ui", component, exports, primitive),
        native: inapplicableMapping(
          `${id} has no approved Expo source wrapper in contract version 1; use platform feedback instead.`,
        ),
      },
      requiredStates: ["default", "hover", "focus", "active", "disabled"],
      fixtures: [`component.${id}.v1`],
    });
  }

  components.push({
    id: "typography.text",
    category: "typography",
    semanticImport: "text",
    targets: {
      web: inapplicableMapping(
        "Web and Electron use semantic HTML typography rather than a generated Text wrapper.",
      ),
      electron: inapplicableMapping(
        "Electron uses semantic HTML typography rather than a generated Text wrapper.",
      ),
      native: applicableMapping("react-native-reusables", "text", ["Text"], "react-native/Text"),
    },
    requiredStates: ["default", "disabled"],
    fixtures: ["component.typography.text.v1"],
  });

  return {
    $schema: "https://ghostinit.dev/schemas/component-registry.schema.json",
    schemaVersion: 1,
    registryVersion: "1.0.0",
    componentBase: "base-ui",
    iconLibraries: { web: "lucide-react", electron: "lucide-react", native: "lucide-react-native" },
    components: components.sort((left, right) => String(left.id).localeCompare(String(right.id))),
  };
}

export function componentRegistryContent(): string {
  return `${JSON.stringify(componentRegistry(), null, 2)}\n`;
}

export function componentRegistryFile(layout: ResolvedUiLayout): TemplateFile {
  return file(layout.componentRegistryPath, componentRegistryContent());
}
