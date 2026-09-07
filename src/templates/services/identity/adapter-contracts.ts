import { serverOnly } from "./shared.js";

export function identityAdapterContractsContent(): string {
  return `${serverOnly}
import type { IdentityAdapterPort } from "./ports.js";

/** Postgres and Convex composition roots implement the exact same contract. */
export interface PostgresIdentityAdapter extends IdentityAdapterPort {
  readonly kind: "postgres";
}

export interface ConvexIdentityAdapter extends IdentityAdapterPort {
  readonly kind: "convex";
}

export type SupportedIdentityAdapter = PostgresIdentityAdapter | ConvexIdentityAdapter;

export function definePostgresIdentityAdapter<T extends PostgresIdentityAdapter>(adapter: T): T {
  return adapter;
}

export function defineConvexIdentityAdapter<T extends ConvexIdentityAdapter>(adapter: T): T {
  return adapter;
}

/** Compile-time parity guard for adapter contract tests. */
export type IdentityAdapterParity =
  Exclude<keyof PostgresIdentityAdapter, "kind"> extends Exclude<keyof ConvexIdentityAdapter, "kind">
    ? Exclude<keyof ConvexIdentityAdapter, "kind"> extends Exclude<keyof PostgresIdentityAdapter, "kind">
      ? true
      : never
    : never;
`;
}
