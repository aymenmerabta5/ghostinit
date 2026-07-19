/**
 * Framework-agnostic marketing sections shared between Next, TanStack, single flat.
 * Small fragments used by both marketing composers.
 */
export const marketingBadge = "Bun only • Better Auth • Drizzle • Billing flexible";

export function heroSection(projectName: string): string[] {
  return [
    `<Badge variant='secondary' className='w-fit'>${marketingBadge}</Badge>`,
    `<h1>${projectName}</h1>`,
  ];
}
