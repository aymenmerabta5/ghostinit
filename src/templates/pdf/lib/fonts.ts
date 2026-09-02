export function fontsContent(): string {
  return `import { statSync } from "node:fs";
import { join } from "node:path";
import { Font } from "@react-pdf/renderer";

type DejaVuFontFile =
  | "DejaVuSans.ttf"
  | "DejaVuSans-Bold.ttf"
  | "DejaVuSerif.ttf"
  | "DejaVuSerif-Bold.ttf";

export interface PdfFontSources {
  readonly sans: string;
  readonly sansBold: string;
  readonly serif: string;
  readonly serifBold: string;
}

function bunResolve(specifier: string): string | null {
  const bunRuntime: unknown = Reflect.get(globalThis, "Bun");
  if (!bunRuntime || typeof bunRuntime !== "object") return null;
  const resolveSync: unknown = Reflect.get(bunRuntime, "resolveSync");
  if (typeof resolveSync !== "function") return null;
  const resolved: unknown = Reflect.apply(resolveSync, bunRuntime, [specifier, process.cwd()]);
  if (typeof resolved !== "string") throw new TypeError("Bun returned an invalid PDF font path");
  return resolved;
}

function resolveDejaVuFont(fileName: DejaVuFontFile): string {
  const specifier = \`dejavu-fonts-ttf/ttf/\${fileName}\`;
  const resolved =
    bunResolve(specifier) ??
    join(process.cwd(), "node_modules", "dejavu-fonts-ttf", "ttf", fileName);
  if (!statSync(/* turbopackIgnore: true */ resolved).isFile()) {
    throw new Error(\`PDF font is not a regular file: \${fileName}\`);
  }
  return resolved;
}

function localFontSources(): PdfFontSources {
  return {
    sans: resolveDejaVuFont("DejaVuSans.ttf"),
    sansBold: resolveDejaVuFont("DejaVuSans-Bold.ttf"),
    serif: resolveDejaVuFont("DejaVuSerif.ttf"),
    serifBold: resolveDejaVuFont("DejaVuSerif-Bold.ttf"),
  };
}

let registered = false;

export function registerPdfFonts(sources?: PdfFontSources): void {
  if (registered) return;
  const resolved = sources ?? localFontSources();
  Font.register({ family: "DejaVu Sans", src: resolved.sans });
  Font.register({ family: "DejaVu Sans Bold", src: resolved.sansBold });
  Font.register({ family: "DejaVu Serif", src: resolved.serif });
  Font.register({ family: "DejaVu Serif Bold", src: resolved.serifBold });
  registered = true;
}
`;
}
