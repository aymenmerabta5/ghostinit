import { file, type TemplateFile } from "../../../shared.js";

export function chartFiles(): TemplateFile[] {
  return [
    file(
      "apps/web/src/components/ui/chart.tsx",
      `"use client";

import * as React from "react";
import { cn } from "../../lib/utils.js";

export type ChartConfig = Record<string, { label?: string; color?: string; icon?: React.ComponentType }>;

export function ChartContainer({
  config: _config,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & { config: ChartConfig }) {
  return (
    <div data-slot="chart" className={cn("flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line]:stroke-border/50", className)} {...props}>
      {children}
    </div>
  );
}

export function ChartTooltip({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="chart-tooltip" className={cn("rounded-lg border bg-background p-2 shadow-md", className)} {...props} />;
}

export function ChartTooltipContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="chart-tooltip-content" className={cn("flex flex-col gap-1", className)} {...props} />;
}

export function ChartLegend({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="chart-legend" className={cn("flex items-center justify-center gap-4 pt-3", className)} {...props} />;
}

export function ChartLegendContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="chart-legend-content" className={cn("flex items-center gap-2 [&_svg]:size-3", className)} {...props} />;
}
`,
    ),
  ];
}
