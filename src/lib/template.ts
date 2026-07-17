/**
 * Minimal template renderer.
 *
 * Files contain placeholders wrapped in double braces, e.g. {{projectName}}.
 * Only simple scalar substitutions are supported; everything else is handled
 * by generated TypeScript code in the template manifest.
 */

export function render(
  content: string,
  variables: Record<string, string | number | boolean>,
): string {
  return content.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = variables[key];
    return value === undefined ? `{{${key}}}` : String(value);
  });
}

export function renderFile<T extends Record<string, string | number | boolean>>(
  file: { path: string; content: string },
  variables: T,
): { path: string; content: string } {
  return {
    path: render(file.path, variables),
    content: render(file.content, variables),
  };
}
