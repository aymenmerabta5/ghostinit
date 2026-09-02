export const FEATURE_FLAGS_CAPABILITY_FRAGMENT = Object.freeze({
  id: "feature-flags",
  description:
    "Provider-neutral remote rollout evaluation, explicitly excluded from authorization.",
  requirements: Object.freeze([
    Object.freeze({ kind: "capability", capability: "transport" }),
    Object.freeze({ kind: "backend" }),
    Object.freeze({
      kind: "target-binding",
      subject: "backend-host",
      targets: Object.freeze(["nextjs", "tanstack-start"]),
    }),
  ]),
  acceptanceOperationIds: Object.freeze([
    "feature-flags.evaluate",
    "feature-flags.evaluate-many",
    "feature-flags.provider-failure-no-fallback",
    "feature-flags.never-authorizes",
    "feature-flags.static-config-separated",
  ]),
} as const);
