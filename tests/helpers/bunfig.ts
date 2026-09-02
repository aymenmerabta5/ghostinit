import { supplyChain } from "../../packages/versions/src/index.js";

/** Bun config for standalone temporary projects that resolve registry packages. */
export function minimumReleaseAgeBunfigContent(): string {
  return `[install]
minimumReleaseAge = ${supplyChain.minimumReleaseAgeSeconds}
minimumReleaseAgeExcludes = []
`;
}
