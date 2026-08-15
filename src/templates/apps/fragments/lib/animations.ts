import { file, type TemplateFile } from "../../../shared.js";

// Stagio: src/lib/animations.ts — central reveal variants, no inline initial={{opacity:0,y:20}}
export function animationsLibFiles(base = "apps/web/src"): TemplateFile[] {
  const content = `import type { Transition, Variants } from "motion";

export const reveal: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

export const ease: Transition["ease"] = [0.4, 0, 0.2, 1] as const;

export const revealTransition: Transition = {
  duration: 0.6,
  ease,
} as const;

export function revealWithDelay(delay: number): Transition {
  return { duration: 0.6, ease, delay };
}

export const reducedMotionTransition: Transition = {
  duration: 0.01,
  delay: 0,
} as const;

export function getRevealVariants(prefersReducedMotion: boolean): Variants {
  return prefersReducedMotion ? fadeIn : reveal;
}

export function getTransition(transition: Transition, prefersReducedMotion: boolean): Transition {
  if (!prefersReducedMotion) return transition;
  return { ...transition, ...reducedMotionTransition };
}

export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
};

export const slideUp: Variants = {
  initial: { y: 20 },
  animate: { y: 0 },
};
`;
  return [file(`${base}/lib/animations.ts`, content)];
}
