export type RouterType = "next" | "tanstack";

export const sharedAuthImports = {
  ui: `import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";`,
  uiNext: `import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";`,
  field: `import { FieldGroup, Field, FieldLabel, FieldDescription } from "@/components/ui/field";`,
  form: `import { Form, Field as TanStackField, SubmitButton, useForm } from "@/components/ui/form";`,
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
