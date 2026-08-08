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
      qrcode: \`^\${v.pdf.qrcode}\`,
      "@repo/kernel": "workspace:*",
    },
    devDependencies: {
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
    include: ["src/**/*"],
    compilerOptions: { types: ["node", "react"], jsx: "react-jsx", composite: true, declaration: true, outDir: "./dist", rootDir: "./src" },
  });
}
`;
}
