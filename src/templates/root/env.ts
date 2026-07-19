import { file, type TemplateFile } from "../shared.js";
import type { GenerateContext } from "../shared.js";
import type { RootSecrets } from "./secrets.js";
import { envPlaceholderContent, envLocalContent } from "../shared/env.js";

export function envExample(
  projectName: string,
  secrets: RootSecrets,
  ctx: GenerateContext,
): TemplateFile {
  const isDryRun = (ctx as any).dryRun === true;
  if (isDryRun) {
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
  const isDryRun = (ctx as any).dryRun === true;
  if (isDryRun) {
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
  const isDryRun = (ctx as any).dryRun === true;
  if (isDryRun) {
    const content =
      `BETTER_AUTH_SECRET=REPLACE_WITH_A_STRONG_SECRET_AT_LEAST_32_CHARS\nPOSTGRES_PASSWORD=REPLACE_WITH_A_STRONG_POSTGRES_PASSWORD\n` +
      envPlaceholderContent(projectName);
    return file("apps/web/.env.local", content);
  }
  const content = envLocalContent(projectName, secrets, [], "monorepo", "bun");
  return file("apps/web/.env.local", content);
}
