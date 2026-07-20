import { file, type TemplateFile } from "../shared.js";
import type { GenerateContext } from "../shared.js";
import type { RootSecrets } from "./secrets.js";
import { envPlaceholderContent, envLocalContent } from "../shared/env.js";

function isDryRunCtx(ctx: GenerateContext): boolean {
  return (ctx as unknown as { dryRun?: boolean }).dryRun === true;
}

export function envExample(
  projectName: string,
  secrets: RootSecrets,
  ctx: GenerateContext,
): TemplateFile {
  if (isDryRunCtx(ctx)) {
    const content =
      `BETTER_AUTH_SECRET=REPLACE_WITH_A_STRONG_SECRET_AT_LEAST_32_CHARS\nBETTER_AUTH_URL=http://localhost:3000\nPOSTGRES_PASSWORD=REPLACE_WITH_A_STRONG_POSTGRES_PASSWORD\n` +
      envPlaceholderContent(projectName);
    return file(".env.example", content);
  }
  const content = envPlaceholderContent(projectName);
  return file(".env.example", content);
}
export function envLocal(
  projectName: string,
  secrets: RootSecrets,
  ctx: GenerateContext,
): TemplateFile {
  if (isDryRunCtx(ctx)) {
    const content =
      `BETTER_AUTH_SECRET=REPLACE_WITH_A_STRONG_SECRET_AT_LEAST_32_CHARS\nPOSTGRES_PASSWORD=REPLACE_WITH_A_STRONG_POSTGRES_PASSWORD\n` +
      envPlaceholderContent(projectName);
    return file(".env.local", content);
  }
  const content = envLocalContent(projectName, secrets, [], "monorepo", "bun");
  return file(".env.local", content);
}
export function webEnvLocal(
  projectName: string,
  secrets: RootSecrets,
  ctx: GenerateContext,
): TemplateFile {
  if (isDryRunCtx(ctx)) {
    const content =
      `BETTER_AUTH_SECRET=REPLACE_WITH_A_STRONG_SECRET_AT_LEAST_32_CHARS\nPOSTGRES_PASSWORD=REPLACE_WITH_A_STRONG_POSTGRES_PASSWORD\n` +
      envPlaceholderContent(projectName);
    return file("apps/web/.env.local", content);
  }
  const content = envLocalContent(projectName, secrets, [], "monorepo", "bun");
  return file("apps/web/.env.local", content);
}
export function mobileEnvLocal(
  projectName: string,
  secrets: RootSecrets,
  ctx: GenerateContext,
): TemplateFile {
  if (isDryRunCtx(ctx)) {
    const content =
      `BETTER_AUTH_SECRET=REPLACE_WITH_A_STRONG_SECRET_AT_LEAST_32_CHARS\nPOSTGRES_PASSWORD=REPLACE_WITH_A_STRONG_POSTGRES_PASSWORD\n` +
      envPlaceholderContent(projectName);
    return file("apps/mobile/.env.local", content);
  }
  const content = envLocalContent(projectName, secrets, [], "monorepo", "bun");
  return file("apps/mobile/.env.local", content);
}
