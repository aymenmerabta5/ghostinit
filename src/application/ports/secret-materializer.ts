import type { SelfIssuedSecretOperation } from "../../domain/generation/types.js";

export interface SecretMaterializationReceipt {
  readonly references: readonly string[];
}

/**
 * Side-effect boundary for the post-install secret phase. Implementations keep
 * materialized values inside the transaction and return references only.
 */
export interface SecretMaterializerPort {
  materialize(
    operations: readonly SelfIssuedSecretOperation[],
  ): Promise<SecretMaterializationReceipt>;
}
