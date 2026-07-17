import { codeScripts, file, packageJson, tsconfig, type TemplateFile } from "./shared.js";
import * as v from "./versions.js";

export function uiPackage(): TemplateFile[] {
  return [
    file(
      "packages/ui/package.json",
      packageJson({
        name: "@repo/ui",
        scripts: codeScripts(),
        exports: { ".": "./src/index.ts" },
        dependencies: {
          "@base-ui/react": `^${v.ui["@base-ui/react"]}`,
          "@tanstack/react-form": `^${v.tanstack["@tanstack/react-form"]}`,
          clsx: `^${v.ui.clsx}`,
          "tailwind-merge": `^${v.ui["tailwind-merge"]}`,
          "class-variance-authority": `^${v.ui["class-variance-authority"]}`,
          react: `^${v.nextStack.react}`,
          "react-dom": `^${v.nextStack["react-dom"]}`,
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
        compilerOptions: {
          jsx: "react-jsx",
        },
      }),
    ),
    file(
      "packages/ui/src/lib/utils.ts",
      `import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
`,
    ),
    file(
      "packages/ui/src/components/button.tsx",
      `import * as React from "react";
import { Button as BaseButton } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils.js";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        default: "bg-slate-900 text-white hover:bg-slate-800",
        destructive: "bg-red-600 text-white hover:bg-red-700",
        outline: "border border-slate-300 bg-transparent hover:bg-slate-100",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 px-3",
        lg: "h-12 px-6",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ComponentPropsWithoutRef<typeof BaseButton>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <BaseButton
        className={cn(buttonVariants({ variant, size }), className)}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
`,
    ),
    file(
      "packages/ui/src/components/input.tsx",
      `import * as React from "react";
import { Input as BaseInput } from "@base-ui/react/input";
import { cn } from "../lib/utils.js";

export interface InputProps extends React.ComponentPropsWithoutRef<typeof BaseInput> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    return (
      <BaseInput
        className={cn(
          "flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";
`,
    ),
    file(
      "packages/ui/src/components/label.tsx",
      `import * as React from "react";
import { cn } from "../lib/utils.js";

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {}

export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn("text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70", className)}
      {...props}
    />
  ),
);
Label.displayName = "Label";
`,
    ),
    file(
      "packages/ui/src/components/card.tsx",
      `"use client";

import * as React from "react";
import { cn } from "../lib/utils.js";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-xl border border-slate-200 bg-white text-slate-950 shadow",
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = "Card";
`,
    ),
    file(
      "packages/ui/src/components/badge.tsx",
      `"use client";

import * as React from "react";
import { cn } from "../lib/utils.js";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        "inline-flex items-center rounded-full border border-slate-200 px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2",
        className,
      )}
      {...props}
    />
  ),
);
Badge.displayName = "Badge";
`,
    ),
    file(
      "packages/ui/src/index.ts",
      `export { Button, type ButtonProps } from "./components/button.js";
export { Input, type InputProps } from "./components/input.js";
export { Label, type LabelProps } from "./components/label.js";
export { Card, type CardProps } from "./components/card.js";
export { Badge, type BadgeProps } from "./components/badge.js";
export { cn } from "./lib/utils.js";
`,
    ),
  ];
}
