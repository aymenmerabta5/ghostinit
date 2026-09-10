export const passkeyQueryImports = `import { useRef } from "react";
import { useQueryAuthSession } from "@/components/query-auth-boundary";
import { useAuthOwnedEffect } from "@/hooks/use-auth-owned-effect";`;

export function passkeyQueryHelpersContent(): string {
  return `export function passkeyListQueryOptions(owner: QueryAuthIdentity | null, isCurrent: () => boolean) {
  return {
    queryKey: owner ? authScopedQueryKey({ ...owner, tenantId: null, teamId: null }, ["identity", "passkeys"]) : ["auth", "anonymous", "passkeys"],
    enabled: Boolean(owner) && typeof window !== "undefined",
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      signal.throwIfAborted();
      if (!owner || !isCurrent()) throw new DOMException("Passkey request owner changed", "AbortError");
      const result = await identityPasskeyClient.list({ signal });
      signal.throwIfAborted();
      if (!isCurrent()) throw new DOMException("Passkey request owner changed", "AbortError");
      if (result.error) throw new Error("Passkeys could not be loaded", { cause: result.error });
      return result.data ?? [];
    },
  };
}

export function usePasskeyListQuery() {
  const queryClient = useQueryClient();
  const captureOwner = useAuthOwnedEffect();
  const session = identityClient.useSession();
  const canonical = useQueryAuthSession();
  const provider = session.isPending || session.error ? null : queryAuthIdentityFromSession(session.data);
  const admitted = !canonical?.hasCanonicalApi || (!canonical.isPending && !canonical.error &&
    canonical.scope !== null && queryAuthIdentitySignature(canonical.scope) === queryAuthIdentitySignature(provider));
  const owner = admitted ? provider : null;
  const signature = queryAuthIdentitySignature(owner);
  const latestSignature = useRef(signature);
  latestSignature.current = signature;
  const generation = currentQueryAuthGeneration(queryClient);
  return useQuery(passkeyListQueryOptions(owner, () => {
    const isMountedOwner = captureOwner();
    return latestSignature.current === signature && currentQueryAuthGeneration(queryClient) === generation && isMountedOwner();
  }));
}
`;
}
