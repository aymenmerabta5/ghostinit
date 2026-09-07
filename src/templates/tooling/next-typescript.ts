export const NEXT_COMPILER_OPTIONS = {
  allowJs: true,
  noEmit: true,
  isolatedModules: true,
  jsx: "react-jsx",
  plugins: [{ name: "next" }],
} as const;

export const NEXT_TYPE_INCLUDES = [".next/types/**/*.ts", ".next/dev/types/**/*.ts"] as const;
