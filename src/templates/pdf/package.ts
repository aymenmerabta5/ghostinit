export function pdfPackageJsonContent(): string {
  return `import { packageJson, codeScripts } from "../shared.js";
import * as v from "../versions.js";

export function pdfPackageJson(): string {
  return packageJson({
    name: "@repo/pdf",
    exports: { ".": "./src/index.ts" },
    scripts: codeScripts(),
    dependencies: {
      "@react-pdf/renderer": \`^\${v.pdf["@react-pdf/renderer"]}\`,
      "dejavu-fonts-ttf": \`^\${v.pdf["dejavu-fonts-ttf"]}\`,
      pdfkit: \`^\${v.pdf.pdfkit}\`,
      qrcode: \`^\${v.pdf.qrcode}\`,
      react: \`^\${v.nextStack.react}\`,
    },
    devDependencies: {
      "bun-types": \`^\${v.runtime.bun}\`,
      "@types/node": \`^\${v.runtime["@types/node"]}\`,
      "@types/qrcode": \`^\${v.pdf["@types/qrcode"]}\`,
      "@types/react": \`^\${v.nextStack["@types/react"]}\`,
      typescript: \`^\${v.typescript.typescript}\`,
    },
  });
}
`;
}

export function pdfPackageTsconfigContent(): string {
  return `import { tsconfig } from "../shared.js";
export function pdfTsconfig(): string {
  return tsconfig({
    include: ["src/**/*", "tests/**/*"],
    compilerOptions: { types: ["bun-types/test", "node", "react"], jsx: "react-jsx", composite: true, declaration: true, outDir: "./dist", rootDir: "." },
  });
}
`;
}
