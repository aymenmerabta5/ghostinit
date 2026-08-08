export function borderClassicContent(): string {
  return `import { StyleSheet, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";

const styles = StyleSheet.create({
  outer: { flex: 1, borderWidth: 3, borderColor: "#1a1a2e", padding: 3, position: "relative" },
  inner: { flex: 1, borderWidth: 1, borderColor: "#c9a227", padding: 28, justifyContent: "space-between" },
});

export default function BorderClassic({ children }: { children: ReactNode }) {
  return (
    <View style={styles.outer}>
      <View style={styles.inner}>{children}</View>
    </View>
  );
}
`;
}

export function borderFormalContent(): string {
  return `import { StyleSheet, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";

const styles = StyleSheet.create({
  outer: { flex: 1, borderWidth: 2, borderColor: "#0f172a", padding: 8, backgroundColor: "#ffffff" },
  inner: { flex: 1, borderWidth: 1, borderColor: "#e2e8f0", padding: 24 },
});

export default function BorderFormal({ children }: { children: ReactNode }) {
  return <View style={styles.outer}><View style={styles.inner}>{children}</View></View>;
}
`;
}

export function borderMinimalContent(): string {
  return `import { View } from "@react-pdf/renderer";
import type { ReactNode } from "react";

export default function BorderMinimal({ children }: { children: ReactNode }) {
  return <View style={{ flex: 1, padding: 32 }}>{children}</View>;
}
`;
}

export function borderModernContent(): string {
  return `import { StyleSheet, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";

const styles = StyleSheet.create({
  outer: { flex: 1, borderWidth: 1, borderColor: "#d97706", padding: 4, borderRadius: 8 },
  inner: { flex: 1, padding: 24 },
});

export default function BorderModern({ children }: { children: ReactNode }) {
  return <View style={styles.outer}><View style={styles.inner}>{children}</View></View>;
}
`;
}

export function borderOrnateContent(): string {
  return `import { StyleSheet, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";

const styles = StyleSheet.create({
  outer: { flex: 1, borderWidth: 4, borderColor: "#7c2d12", padding: 4, backgroundColor: "#fffbeb" },
  inner: { flex: 1, borderWidth: 1, borderColor: "#f59e0b", borderStyle: "dashed", padding: 24 },
});

export default function BorderOrnate({ children }: { children: ReactNode }) {
  return <View style={styles.outer}><View style={styles.inner}>{children}</View></View>;
}
`;
}

export function borderPremiumContent(): string {
  return `import { StyleSheet, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";

const styles = StyleSheet.create({
  outer: { flex: 1, borderWidth: 3, borderColor: "#1e1b4b", padding: 2, backgroundColor: "#f8fafc" },
  inner: { flex: 1, borderWidth: 2, borderColor: "#c9a227", padding: 28 },
});

export default function BorderPremium({ children }: { children: ReactNode }) {
  return <View style={styles.outer}><View style={styles.inner}>{children}</View></View>;
}
`;
}

export function bordersIndexContent(): string {
  return `import BorderClassic from "./BorderClassic";
import BorderFormal from "./BorderFormal";
import BorderMinimal from "./BorderMinimal";
import BorderModern from "./BorderModern";
import BorderOrnate from "./BorderOrnate";
import BorderPremium from "./BorderPremium";

export const borderComponents = {
  classic: BorderClassic,
  formal: BorderFormal,
  minimal: BorderMinimal,
  modern: BorderModern,
  ornate: BorderOrnate,
  premium: BorderPremium,
} as const;

export type BorderStyleKey = keyof typeof borderComponents;
`;
}
