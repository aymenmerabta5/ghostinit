import { file, type TemplateFile } from "../../shared.js";

/** Convex checks this project independently of the application's root tsconfig. */
export function convexTypeScriptConfigFile(): TemplateFile {
  return file(
    "convex/tsconfig.json",
    JSON.stringify(
      {
        compilerOptions: {
          allowJs: true,
          strict: true,
          moduleResolution: "Bundler",
          jsx: "react-jsx",
          skipLibCheck: true,
          allowSyntheticDefaultImports: true,
          target: "ESNext",
          lib: ["ES2023", "DOM"],
          forceConsistentCasingInFileNames: true,
          module: "ESNext",
          isolatedModules: true,
          noEmit: true,
          // Generated auth and provider boundaries read process.env.
          types: ["node"],
        },
        include: ["./**/*"],
        exclude: ["./_generated"],
      },
      null,
      2,
    ) + "\n",
  );
}
