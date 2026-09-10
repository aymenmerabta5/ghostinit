export interface TestElement {
  type: unknown;
  props: Record<string, unknown>;
  children: unknown[];
}

export function elements(value: unknown): TestElement[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!value || typeof value !== "object" || !("type" in value)) return [];
  const node = value as TestElement;
  return [node, ...node.children.flatMap(elements)];
}

export function textContent(value: unknown): string {
  if (Array.isArray(value)) return value.map(textContent).join(" ");
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object" || !("children" in value)) return "";
  return textContent((value as TestElement).children);
}

export async function flush(): Promise<void> {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

interface FormOptions {
  defaultValues: Record<string, string>;
  onSubmit(args: { value: Record<string, string> }): Promise<void>;
}

export interface TestForm {
  options: FormOptions;
  values: Record<string, string>;
  isSubmitting: boolean;
  resets: number;
  readonly state: { isSubmitting: boolean; values: Record<string, string> };
  readonly store: { state: TestForm["state"] };
  setFieldValue(name: string, value: string): void;
  reset(values?: Record<string, string>): void;
  handleSubmit(): Promise<void>;
}

export function generatedFormHarness(
  source: string,
  exportedNames: string[],
  additionalBindings: Record<string, unknown> = {},
) {
  const slots: unknown[] = [];
  const forms: TestForm[] = [];
  let cursor = 0;
  let hydrated = true;
  const effects = new Map<
    number,
    {
      dependencies?: readonly unknown[];
      effect: () => unknown;
      cleanup?: () => void;
      pending: boolean;
    }
  >();
  function useState(initial: unknown) {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
    return [
      slots[index],
      (value: unknown) =>
        (slots[index] = typeof value === "function" ? value(slots[index]) : value),
    ];
  }
  const React = {
    createElement: (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) =>
      ({ type, props: props ?? {}, children }) satisfies TestElement,
    useState,
    useEffect(effect: () => unknown, dependencies?: readonly unknown[]) {
      const index = cursor++;
      const prior = effects.get(index);
      const changed =
        !prior ||
        !dependencies ||
        !prior.dependencies ||
        dependencies.length !== prior.dependencies.length ||
        dependencies.some((value, offset) => !Object.is(value, prior.dependencies?.[offset]));
      if (changed)
        effects.set(index, { dependencies, effect, cleanup: prior?.cleanup, pending: true });
    },
    useReducer(reducer: (state: unknown, action: unknown) => unknown, initial: unknown) {
      const [state, set] = useState(initial);
      return [
        state,
        (action: unknown) =>
          (set as (value: unknown) => void)((current: unknown) => reducer(current, action)),
      ];
    },
    useMemo: (calculate: () => unknown) => calculate(),
    useId() {
      const index = cursor++;
      return (slots[index] ??= `generated-${index}`);
    },
    useCallback: (callback: unknown) => callback,
    useSyncExternalStore: () => hydrated,
    useStore: (store: { state: unknown }, selector: (state: unknown) => unknown) =>
      selector(store.state),
    useRef(initial: unknown) {
      const index = cursor++;
      return (slots[index] ??= { current: initial });
    },
  };
  const bindings: Record<string, unknown> = {
    React,
    useState,
    useRef: React.useRef,
    useEffect: React.useEffect,
    useSyncExternalStore: () => hydrated,
    useSurfaceTranslations: () => (key: string) => key,
    cn: (...values: string[]) => values.filter(Boolean).join(" "),
    createFormHook: () => ({}),
    fieldContext: {},
    formContext: {},
    createProfileSchema: () => ({}),
    createChangePasswordSchema: () => ({}),
    useAppForm(options: FormOptions) {
      const index = cursor++;
      if (!slots[index]) {
        const form: TestForm = {
          options,
          values: { ...options.defaultValues },
          isSubmitting: false,
          resets: 0,
          get state() {
            return { isSubmitting: form.isSubmitting, values: form.values };
          },
          get store() {
            return { state: form.state };
          },
          setFieldValue(name, value) {
            form.values[name] = value;
          },
          reset(values) {
            form.resets += 1;
            form.values = { ...(values ?? form.options.defaultValues) };
          },
          async handleSubmit() {
            if (form.isSubmitting) return;
            form.isSubmitting = true;
            try {
              await form.options.onSubmit({ value: form.values });
            } finally {
              form.isSubmitting = false;
            }
          },
        };
        slots[index] = Object.assign(form, {
          AppForm: "AppForm",
          AppField: "AppField",
          SubmitButton: "SubmitButton",
        });
        forms.push(form);
      }
      const form = slots[index] as TestForm;
      form.options = options;
      return form;
    },
  };
  bindings.useForm = bindings.useAppForm;
  bindings.useStore = React.useStore;
  for (const name of [
    "Alert",
    "AlertDescription",
    "AlertTitle",
    "Button",
    "Card",
    "CardContent",
    "CardDescription",
    "CardHeader",
    "CardTitle",
    "FieldGroup",
    "Form",
    "Skeleton",
    "Spinner",
    "AppCheckboxField",
    "AppOtpField",
    "AppPasswordField",
    "AppSelectField",
    "AppTextAreaField",
    "AppTextField",
  ])
    bindings[name] = name;
  Object.assign(bindings, additionalBindings);
  for (const match of source.matchAll(/\b(?:function|const|let|var|class)\s+([A-Za-z_]\w*)/g)) {
    if (match[1]) delete bindings[match[1]];
  }
  for (const match of source.matchAll(/\b(?:const|let|var)\s*\{([^}]+)\}/g)) {
    for (const name of match[1]?.match(/[A-Za-z_]\w*/g) ?? []) delete bindings[name];
  }
  const executable = new Bun.Transpiler({
    loader: "tsx",
    tsconfig: { compilerOptions: { jsx: "react" } },
  }).transformSync(
    source
      .replace(/^import[^;]+;\s*/gm, "")
      .replace(/^export default (?=(?:function|class)\b)/gm, "")
      .replace(/^export default \w+;\s*$/gm, "")
      .replace(/^export type \{[^}]+\}(?: from [^;]+)?;\s*/gm, "")
      .replace(/^export \{[^}]+\}(?: from [^;]+)?;\s*/gm, "")
      .replace(/^export /gm, ""),
  );
  const module = new Function(
    ...Object.keys(bindings),
    `${executable}\nreturn {${exportedNames.join(",")}};`,
  )(...Object.values(bindings)) as Record<string, (props?: unknown) => unknown>;
  return {
    forms,
    module,
    setHydrated(value: boolean) {
      hydrated = value;
    },
    flushEffects() {
      for (const value of effects.values()) {
        if (!value.pending) continue;
        value.pending = false;
        value.cleanup?.();
        const cleanup = value.effect();
        value.cleanup = typeof cleanup === "function" ? (cleanup as () => void) : undefined;
      }
    },
    unmount() {
      for (const value of effects.values()) value.cleanup?.();
      effects.clear();
    },
    render(name: string, props?: unknown) {
      cursor = 0;
      const component = module[name];
      if (!component) throw new Error(`Missing generated component ${name}`);
      return component(props);
    },
  };
}
