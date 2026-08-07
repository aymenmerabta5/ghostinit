/**
 * Template validation helper — parses generated files with oxc-parser.
 *
 * Templates are string arrays, so host `tsc` never typechecks the OUTPUT.
 * This helper parses every emitted TS/TSX file at generation time when the
 * optional flag is enabled, catching unbalanced quotes, stray braces and
 * botched interpolation before files hit disk.
 */

import { parseSync } from "oxc-parser";

export interface TemplateValidationError {
  path: string;
  message: string;
}

export interface TemplateValidationResult {
  valid: boolean;
  errors: TemplateValidationError[];
}

export interface ValidateOptions {
  /** When true, stop after first failing file. Default false. */
  strict?: boolean;
  /** Optional flag to enable validation. When false, caller skips validation. */
  enabled?: boolean;
}

const CODE_EXT = /\.(ts|tsx|js|jsx|mts|cts|mjs|cjs)$/;

function shouldParse(path: string): boolean {
  return CODE_EXT.test(path);
}

export function validateGeneratedFiles(
  files: Array<{ path: string; content: string }>,
  opts: ValidateOptions = {},
): TemplateValidationResult {
  const errors: TemplateValidationError[] = [];

  for (const f of files) {
    if (!shouldParse(f.path)) continue;
    const result = parseSync(f.path, f.content);
    if (result.errors.length > 0) {
      for (const e of result.errors) {
        const msg = (e as { message?: string })?.message ?? String(e);
        errors.push({ path: f.path, message: msg });
      }
      if (opts.strict) break;
    }
  }

  return { valid: errors.length === 0, errors };
}

export function assertValidGeneratedFiles(
  files: Array<{ path: string; content: string }>,
  opts: ValidateOptions = {},
): void {
  const result = validateGeneratedFiles(files, opts);
  if (!result.valid) {
    const detail = result.errors.map((e) => `  ${e.path}: ${e.message}`).join("\n");
    throw new Error(
      `Template validation failed: ${result.errors.length} file(s) have parse errors\n${detail}`,
    );
  }
}

/**
 * Validate at generation time when the optional flag is enabled.
 * Flag can be driven by GenerateContext.validate or GHOSTINIT_VALIDATE_TEMPLATES env.
 */
export function maybeValidateGeneratedFiles(
  files: Array<{ path: string; content: string }>,
  ctx?: { validate?: boolean },
): void {
  const envFlag = process.env.GHOSTINIT_VALIDATE_TEMPLATES === "1";
  const should = ctx?.validate === true || envFlag;
  if (should) {
    assertValidGeneratedFiles(files);
  }
}

export function isValidGeneratedFiles(files: Array<{ path: string; content: string }>): boolean {
  return validateGeneratedFiles(files).valid;
}
