import { file, type TemplateFile } from "../../../shared.js";

// Stagio: surface-styles + logical utilities — RTL-safe, editorial premium feel
export function surfaceStylesLibFiles(base = "apps/web/src"): TemplateFile[] {
  const uiContent = `import { cva } from "class-variance-authority";

export const modalOverlayClassName =
  "data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs fixed inset-0 isolate z-50";

export const modalContentClassName =
  "bg-background data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 ring-foreground/10 fixed top-1/2 start-1/2 z-50 grid w-full -translate-x-1/2 -translate-y-1/2 gap-4 text-sm outline-none duration-100";

export const modalHeaderClassName = "flex flex-col gap-2";
export const modalTitleClassName = "font-serif text-xl leading-tight tracking-tight text-heading";
export const modalDescriptionClassName = "text-muted-foreground text-sm leading-relaxed *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground";
export const modalFooterClassName = "bg-muted/50 -mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-none border-t p-4 sm:flex-row sm:justify-end";

export const dialogSizeVariants = cva(
  "max-w-[calc(100%-2rem)] rounded-none p-4 ring-1",
  {
    variants: {
      size: {
        sm: "sm:max-w-xs",
        md: "sm:max-w-sm",
        lg: "sm:max-w-lg",
        xl: "sm:max-w-2xl",
      },
    },
    defaultVariants: { size: "md" },
  },
);

export const dropdownContentClassName =
  "data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=inline-end]:slide-in-from-left-2 bg-background/95 text-popover-foreground min-w-32 border border-border/40 p-1.5 shadow-xl backdrop-blur-xl ring-1 ring-foreground/10 duration-100 z-50 max-h-(--available-height) w-(--anchor-width) origin-(--transform-origin) overflow-x-hidden overflow-y-auto outline-none data-closed:overflow-hidden";
`;

  const logicalContent = `export function isRtlLocale(locale: string): boolean {
  return locale === "ar";
}

export function logicalClass(textAlign: "start" | "end" | "center" | "justify"): string {
  if (textAlign === "start") return "text-start";
  if (textAlign === "end") return "text-end";
  return \`text-\${textAlign}\`;
}

export function marginStartClass(value: string): string {
  return \`ms-\${value}\`;
}

export function paddingStartClass(value: string): string {
  return \`ps-\${value}\`;
}
`;

  return [
    file(`${base}/components/ui/surface-styles.ts`, uiContent),
    file(`${base}/lib/logical.ts`, logicalContent),
  ];
}
