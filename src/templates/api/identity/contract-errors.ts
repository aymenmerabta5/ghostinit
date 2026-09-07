export function identityContractErrorsContent(): string {
  return `export const identityContractErrors = {
  UNAUTHORIZED: { message: "Authentication is required" },
  FORBIDDEN: { message: "The identity operation is not permitted" },
  NOT_FOUND: { message: "The identity resource was not found" },
  BAD_REQUEST: { message: "The identity request is invalid" },
  CONFLICT: { message: "The identity mutation conflicts with current state" },
  INTERNAL_SERVER_ERROR: { message: "The identity operation could not be committed" },
} as const;
`;
}
