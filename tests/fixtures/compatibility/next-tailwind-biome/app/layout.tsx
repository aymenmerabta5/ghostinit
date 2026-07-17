import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "GhostInit Compatibility Fixture",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
