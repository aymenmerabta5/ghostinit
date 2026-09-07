export function hasSelfHostedFontPolicy(csp: string): boolean {
  const directives = csp.split(/[;,]/).map((directive) => directive.trim().split(/\s+/));
  const fonts = directives.filter(([name]) => name?.toLowerCase() === "font-src");
  const styles = directives.filter(([name]) =>
    ["style-src", "style-src-elem"].includes(name?.toLowerCase() ?? ""),
  );
  return (
    fonts.length > 0 &&
    fonts.every((sources) => sources.length === 2 && sources[1] === "'self'") &&
    styles.every((sources) =>
      sources.slice(1).every((source) => !/fonts\.(?:googleapis|gstatic)\.com/i.test(source)),
    )
  );
}
