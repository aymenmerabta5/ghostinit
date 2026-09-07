#!/usr/bin/env bun

import {
  EXTERNAL_READINESS_TARGETS,
  isExternalReadinessTarget,
  runExternalReadinessTarget,
  type ExternalReadinessTarget,
} from "./external-readiness-harness.js";
import { configuredSecretValues, sanitizeExternalFailure } from "./external-readiness-http.js";

function usage(): string {
  return [
    "Usage: bun scripts/external-readiness.ts --target <target>",
    `Targets: ${EXTERNAL_READINESS_TARGETS.join(", ")}`,
    "Requires GHOSTINIT_EXTERNAL_READINESS=1 and target-specific environment credentials.",
  ].join("\n");
}

export function parseExternalReadinessTarget(args: readonly string[]): ExternalReadinessTarget {
  if (args.length !== 2 || args[0] !== "--target" || !isExternalReadinessTarget(args[1] ?? "")) {
    throw new Error(usage());
  }
  return args[1] as ExternalReadinessTarget;
}

async function main(): Promise<void> {
  if (Bun.argv.slice(2).includes("--help")) {
    console.log(usage());
    return;
  }
  const target = parseExternalReadinessTarget(Bun.argv.slice(2));
  const result = await runExternalReadinessTarget(target, { environment: process.env });
  console.log(
    JSON.stringify({
      schemaVersion: 1,
      success: true,
      target: result.target,
      durationMs: result.durationMs,
    }),
  );
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    const safeMessage = sanitizeExternalFailure(error, configuredSecretValues(process.env));
    console.error(`[external-readiness] ${safeMessage}`);
    process.exitCode = 1;
  }
}
