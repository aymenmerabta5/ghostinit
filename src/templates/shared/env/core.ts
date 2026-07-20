import { ENV_PLACEHOLDERS } from "../../../lib/constants.js";
import type { RootSecrets } from "../../root.js";

export function coreEnvExampleLines(projectName: string): string[] {
  return [
    "# GhostInit env — placeholders for .env.example",
    `BETTER_AUTH_SECRET=${ENV_PLACEHOLDERS.BETTER_AUTH_SECRET}`,
    "BETTER_AUTH_URL=http://localhost:3000",
    "NEXT_PUBLIC_APP_URL=http://localhost:3000",
    "VITE_APP_URL=http://localhost:3000",
    "EXPO_PUBLIC_APP_URL=http://localhost:3000",
    "NEXT_PUBLIC_API_URL=http://localhost:3000",
    "VITE_API_URL=http://localhost:3000",
    "EXPO_PUBLIC_API_URL=http://localhost:3000",
    `APP_NAME=${projectName}`,
    "POSTGRES_USER=postgres",
    `POSTGRES_PASSWORD=${ENV_PLACEHOLDERS.POSTGRES_PASSWORD}`,
    "POSTGRES_HOST=localhost",
    "POSTGRES_PORT=5432",
    `POSTGRES_DB=${projectName}`,
    "DATABASE_SSL=false",
    "DATABASE_POOL_SIZE=20",
    "TRUSTED_PROXY=false",
  ];
}
export function coreEnvLocalLines(projectName: string, secrets: RootSecrets): string[] {
  return [
    `BETTER_AUTH_SECRET=${secrets.authSecret}`,
    "BETTER_AUTH_URL=http://localhost:3000",
    "NEXT_PUBLIC_APP_URL=http://localhost:3000",
    "VITE_APP_URL=http://localhost:3000",
    "EXPO_PUBLIC_APP_URL=http://localhost:3000",
    "NEXT_PUBLIC_API_URL=http://localhost:3000",
    "VITE_API_URL=http://localhost:3000",
    "EXPO_PUBLIC_API_URL=http://localhost:3000",
    `APP_NAME=${projectName}`,
    "POSTGRES_USER=postgres",
    `POSTGRES_PASSWORD=${secrets.postgresPassword}`,
    "POSTGRES_HOST=localhost",
    "POSTGRES_PORT=5432",
    `POSTGRES_DB=${projectName}`,
    "DATABASE_SSL=false",
    "DATABASE_POOL_SIZE=20",
    "TRUSTED_PROXY=false",
  ];
}
export function resendExampleLines(projectName: string): string[] {
  return [
    `RESEND_API_KEY=${ENV_PLACEHOLDERS.RESEND_API_KEY}`,
    "EMAIL_FROM=noreply@example.com",
    `EMAIL_FROM_NAME=${projectName}`,
    "",
  ];
}
export function resendLocalLines(projectName: string, secrets: RootSecrets): string[] {
  return [
    `RESEND_API_KEY=${secrets.resendApiKey}`,
    "EMAIL_FROM=noreply@example.com",
    `EMAIL_FROM_NAME=${projectName}`,
    "",
  ];
}
