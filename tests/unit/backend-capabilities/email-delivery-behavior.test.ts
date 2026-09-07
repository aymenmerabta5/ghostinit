import { describe, expect, test } from "bun:test";
import { projectConfigSchema } from "../../../src/lib/config.js";
import { generateProjectFiles } from "../../../src/templates/default.js";

type SendOptions = { from?: string; replyTo?: string; cc?: string[]; bcc?: string[] };
type Sender = (
  to: string | string[],
  subject: string,
  component: () => null,
  props: { name: string },
  options?: SendOptions,
) => Promise<{ id: string }>;
type ConvexInput = { to: string; kind: string; locale: string; url: string };
type ConvexSender = (context: object, input: ConvexInput) => Promise<void>;

const transpiler = new Bun.Transpiler({ loader: "ts", target: "bun" });
function executable(source: string, result: string): string {
  const withoutImports = source.replace(/^import[^;]+;\s*/gm, "").replace(/^export /gm, "");
  return transpiler.transformSync(withoutImports) + `\nreturn ${result};`;
}

describe("generated transactional email operation", () => {
  test("sends transactional email through both generated provider paths and propagates delivery failure", async () => {
    for (const mode of ["monorepo", "single"] as const) {
      for (const framework of ["nextjs", "tanstack-start"] as const) {
        for (const database of ["postgres", "convex"] as const) {
          const label = `${mode}/${framework}/${database}`;
          const files = generateProjectFiles(
            projectConfigSchema.parse({
              name: "email-operation-evidence",
              runtime: "bun",
              mode,
              framework,
              database,
              preset: "saas",
              apps: ["web"],
              billing: [],
              features: ["i18n"],
            }),
            { dryRun: true },
          );
          const path =
            mode === "monorepo" ? "packages/email/src/send.ts" : "src/server/email/send.ts";
          const source = files.find((file) => file.path === path)?.content;
          if (!source) throw new Error(`Missing generated email sender: ${path}`);
          const deliveries: Record<string, unknown>[] = [];
          const keys: string[] = [];
          let providerResponse: {
            data: { id?: string } | null;
            error: { message: string } | null;
          } = {
            data: { id: "delivery-1" },
            error: null,
          };
          class Resend {
            constructor(key: string) {
              keys.push(key);
            }
            readonly emails = {
              send: async (input: Record<string, unknown>) => {
                deliveries.push(input);
                return providerResponse;
              },
            };
          }
          const environment = {
            RESEND_API_KEY: "re_fixture_only",
            EMAIL_FROM: "sender@example.test",
          };
          const component = () => null;
          const send = new Function(
            "React",
            "render",
            "Resend",
            "env",
            executable(source, "sendEmail"),
          )(
            { createElement: (type: unknown, props: unknown) => ({ type, props }) },
            async (element: { type: unknown; props: unknown }) => {
              expect(element, label).toEqual({ type: component, props: { name: "Actor" } });
              return "<p>Rendered transactional message</p>";
            },
            Resend,
            environment,
          ) as Sender;
          const options = { replyTo: "support@example.test", cc: ["copy@example.test"] };
          expect(
            await send(
              "actor@example.test",
              "Verify account",
              component,
              { name: "Actor" },
              options,
            ),
            label,
          ).toEqual({ id: "delivery-1" });
          expect(keys, label).toEqual([environment.RESEND_API_KEY]);
          expect(deliveries[0], label).toEqual({
            from: environment.EMAIL_FROM,
            to: ["actor@example.test"],
            subject: "Verify account",
            html: "<p>Rendered transactional message</p>",
            replyTo: options.replyTo,
            cc: options.cc,
            bcc: undefined,
          });
          providerResponse = { data: null, error: { message: "provider refused delivery" } };
          await expect(
            send("actor@example.test", "Subject", component, { name: "Actor" }),
          ).rejects.toThrow("provider refused delivery");
          providerResponse = { data: {}, error: null };
          await expect(
            send("actor@example.test", "Subject", component, { name: "Actor" }),
          ).rejects.toThrow("no delivery ID");
          const attempts = deliveries.length;
          environment.RESEND_API_KEY = "REPLACE_WITH_RESEND_API_KEY";
          await expect(
            send("actor@example.test", "Subject", component, { name: "Actor" }),
          ).rejects.toThrow("not configured");
          expect(deliveries.length, label).toBe(attempts);

          if (database === "convex") {
            const convexSource = files.find((file) => file.path === "convex/authEmail.ts")?.content;
            if (!convexSource) throw new Error("Missing native Convex auth email action");
            const requests: Array<{ url: string; init: RequestInit }> = [];
            let responseStatus = 200;
            const validators = { string: () => null, literal: () => null, union: () => null };
            const nativeSend = new Function(
              "v",
              "internalAction",
              "process",
              "fetch",
              "console",
              executable(convexSource, "send.handler"),
            )(
              validators,
              (definition: unknown) => definition,
              {
                env: {
                  RESEND_API_KEY: "re_fixture_only",
                  EMAIL_FROM: "sender@example.test",
                  APP_NAME: "Fixture",
                },
              },
              async (url: string, init: RequestInit) => {
                requests.push({ url, init });
                return new Response('{"id":"delivery-2"}', { status: responseStatus });
              },
              { error: () => {} },
            ) as ConvexSender;
            const input = {
              to: "actor@example.test",
              kind: "verification",
              locale: "fr",
              url: "https://app.example.test/verify?token=fixture",
            };
            await nativeSend({}, input);
            expect(requests[0]?.url, label).toBe("https://api.resend.com/emails");
            expect(new Headers(requests[0]?.init.headers).get("authorization"), label).toBe(
              "Bearer re_fixture_only",
            );
            const body = JSON.parse(String(requests[0]?.init.body)) as Record<string, unknown>;
            expect(body, label).toMatchObject({
              from: "sender@example.test",
              to: [input.to],
              subject: "Vérifiez votre adresse e-mail — Fixture",
            });
            expect(body.text, label).toContain(input.url);
            responseStatus = 429;
            await expect(nativeSend({}, input)).rejects.toThrow("Email delivery failed");
            const nativeAttempts = requests.length;
            await expect(nativeSend({}, { ...input, url: "javascript:alert(1)" })).rejects.toThrow(
              "unsafe callback URL",
            );
            expect(requests.length, label).toBe(nativeAttempts);
          }
        }
      }
    }
  });
});
