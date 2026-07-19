import { codeScripts, file, packageJson, tsconfig, type TemplateFile } from "../shared.js";
import * as v from "../versions.js";

export function configFiles(): TemplateFile[] {
  return [
    file(
      "packages/ui/package.json",
      packageJson({
        name: "@repo/ui",
        scripts: codeScripts(),
        exports: {
          ".": "./src/index.ts",
          "./form": "./src/components/form.tsx",
          "./chart": "./src/components/chart.tsx",
        },
        dependencies: {
          "@base-ui/react": `^${v.ui["@base-ui/react"]}`,
          "@tanstack/react-form": `^${v.tanstack["@tanstack/react-form"]}`,
          clsx: `^${v.ui.clsx}`,
          "tailwind-merge": `^${v.ui["tailwind-merge"]}`,
          "class-variance-authority": `^${v.ui["class-variance-authority"]}`,
          react: `^${v.nextStack.react}`,
          "react-dom": `^${v.nextStack["react-dom"]}`,
          sonner: `^${v.ui.sonner}`,
          recharts: `^${v.ui.recharts}`,
        },
        devDependencies: {
          "@types/react": `^${v.nextStack["@types/react"]}`,
          "@types/react-dom": `^${v.nextStack["@types/react-dom"]}`,
          typescript: `^${v.typescript.typescript}`,
        },
      }),
    ),
    file(
      "packages/ui/tsconfig.json",
      tsconfig({
        include: ["src/**/*"],
        compilerOptions: { jsx: "react-jsx" },
      }),
    ),
  ];
}

export function barrelContent(): string {
  return `export { Button, buttonVariants, type ButtonProps } from "./components/button.js";
export { Input, type InputProps } from "./components/input.js";
export { Label, type LabelProps } from "./components/label.js";
export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, CardAction, type CardProps } from "./components/card.js";
export { Badge, badgeVariants, type BadgeProps } from "./components/badge.js";
export { Tabs, TabsList, TabsTrigger, TabsContent } from "./components/tabs.js";
export { Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell, TableCaption } from "./components/table.js";
export { Alert, AlertTitle, AlertDescription } from "./components/alert.js";
export { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent, EmptyMedia } from "./components/empty.js";
export { Separator } from "./components/separator.js";
export { Skeleton } from "./components/skeleton.js";
export { Spinner } from "./components/spinner.js";
export {
  FieldGroup,
  Field,
  FieldContent,
  FieldLabel,
  FieldDescription,
  FieldError,
  FieldSet,
  FieldLegend,
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
  ToggleGroup,
  ToggleGroupItem,
} from "./components/field.js";
export { Toaster } from "./components/sonner.js";
export { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, type ChartConfig } from "./components/chart.js";
export { Form, Field as FormField, SubmitButton, useForm } from "./components/form.js";
export { Avatar, AvatarImage, AvatarFallback } from "./components/avatar.js";
export {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "./components/dialog.js";
export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "./components/dropdown-menu.js";
export { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent, TooltipPortal } from "./components/tooltip.js";
export { Popover, PopoverTrigger, PopoverContent, PopoverTitle, PopoverDescription, PopoverPortal } from "./components/popover.js";
export {
  Sheet,
  SheetTrigger,
  SheetPortal,
  SheetClose,
  SheetOverlay,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
} from "./components/sheet.js";
export {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
} from "./components/breadcrumb.js";
export { cn } from "./lib/utils.js";
`;
}

export function barrelFile(): TemplateFile {
  return file("packages/ui/src/index.ts", barrelContent());
}
