/** Shared agent guidance for every generated frontend and packaging mode. */
export function frontendArchitectureInstructionLines(): string[] {
  return [
    "## Frontend Architecture",
    "",
    "Apply these responsibilities to every frontend feature selected in this project. The same contract applies across GhostInit platforms and packaging modes. A small file is not proof of a sound boundary.",
    "",
    "- Routes adapt framework params/search, loading, and access guards, then delegate to a feature screen or the appropriate server boundary. Keep feature UI and workflows out of route entrypoints.",
    "- Feature-root TSX screens, sections, and controllers compose semantic feature hooks and focused views. They do not own raw state/effect/form/data-library hooks, duplicate remote state, or collect unrelated workflows. Use more than one cohesive composition container when needed; no giant screen is required.",
    "- Feature-root `queries.ts` and `mutations.ts` own remote clients, query keys, subscriptions, mutations, and cache invalidation. Preserve account/session ownership and stale-response cancellation; do not mirror remote results into component state.",
    "- The selected form library owns form state. DOM forms reuse the emitted `useAppForm` abstraction. Native forms use their typed native form adapter/workflow over the declared form library; do not import DOM form presenters into a native app.",
    "- Cohesive feature-root `use-*.ts` workflow hooks own form submission, action sequencing, pending/error handling, and cancellation. They call the feature adapters and pure models instead of embedding direct network clients in views.",
    "- Models/utilities own deterministic types, validation, formatting, and transformations. Keep React state, routing, network access, and platform I/O outside pure models.",
    "- Focused views in feature `components/` and app component modules receive typed data and callbacks. Tiny local UI state such as disclosure, focus, or menu visibility is allowed; remote data, multi-step workflows, and duplicated form state belong outside presentation.",
    "- Shared primitives and infrastructure own reusable controls, semantic tokens, form/query providers, and platform transport setup. Do not hide a feature workflow in a shared or primitive folder to evade checks.",
    "- Create only the modules the feature needs. Do not add pass-through wrappers or split code arbitrarily to lower a counter; each extraction must have one coherent responsibility.",
    "",
    "Run `ghostinit check --json` and the project's declared typecheck, `lint:all`, format, test, build, and runtime gates for the change. During GhostInit generator development, use the exact local `dist/cli.js` artifact against the generated project instead of a registry fallback.",
    "",
    "Frontend finding IDs are `frontend-remote-owner`, `frontend-form-owner`, `frontend-view-workflow`, `frontend-server-state-copy`, `frontend-derived-effect-state`, `frontend-model-purity`, `frontend-workflow-budget`, and `frontend-policy-invalid`. Read the reported location and rule; do not invent a numeric budget. Type-only DTO/model imports are allowed; runtime data access is a separate responsibility.",
    "",
    "The project owner may change or remove GhostInit and its policies. Generated lint/typecheck commands remain independently usable. Agents must not silently remove or weaken safeguards to make work pass; changing those safeguards requires explicit developer authorization.",
    "",
    "Architecture findings and failing required gates block an acceptable/complete verdict. Report failing and unrun gates explicitly. Do not suppress findings, disable detectors, raise limits, move/rename code to evade a rule, or add broad exceptions to obtain green output. Validate a suspected false positive and repair the detector without weakening its positive controls. Static checks detect defined syntax/import patterns; reviewers must still verify responsibility boundaries and behavior.",
    "",
  ];
}
