export type RouterType = "next" | "tanstack";

export const sharedAuthImports = {
  ui: `import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, Input, Alert, AlertTitle, AlertDescription, Badge } from "@repo/ui";`,
  uiNext: `import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, Input, Alert, AlertTitle, AlertDescription } from "@repo/ui";`,
  field: `import { FieldGroup, Field, FieldLabel, FieldDescription } from "@repo/ui";`,
  form: `import { Form, Field as TanStackField, SubmitButton, useForm } from "@repo/ui/form";`,
};

export function routerImports(router: RouterType): string {
  if (router === "tanstack")
    return `import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'`;
  return `import { useRouter } from "next/navigation";\nimport Link from "next/link";`;
}
export function authClientImport(): string {
  return `import { authClient } from "../../lib/auth-client.js";`;
}
export function authClientImportTanstack(): string {
  return `import { authClient } from '../lib/auth-client.js'`;
}
