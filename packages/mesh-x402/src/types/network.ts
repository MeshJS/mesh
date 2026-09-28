export type CardanoNetwork = "cardano:mainnet" | "cardano:preprod" | "cardano:preview";

const CIP34_ALIASES: Record<string, CardanoNetwork> = {
  "cip34:1-764824073": "cardano:mainnet",
  "cip34:0-1": "cardano:preprod",
  "cip34:0-2": "cardano:preview",
};

const CARDANO_NETWORKS: readonly CardanoNetwork[] = [
  "cardano:mainnet",
  "cardano:preprod",
  "cardano:preview",
];

/**
 * Normalizes a network identifier to its canonical `cardano:*` form.
 * Accepts the canonical form itself, or a CIP-34 form (`cip34:<networkId>-<networkMagic>`)
 * as an input alias, per the x402 Cardano exact-scheme spec.
 */
export const normalizeCardanoNetwork = (network: string): CardanoNetwork => {
  if ((CARDANO_NETWORKS as readonly string[]).includes(network)) {
    return network as CardanoNetwork;
  }
  const alias = CIP34_ALIASES[network];
  if (alias) return alias;
  throw new Error(`Unrecognized Cardano network identifier: ${network}`);
};

/** Mesh's `networkId` is 0 for any testnet (preprod/preview), 1 for mainnet. */
export const toNetworkId = (network: CardanoNetwork): 0 | 1 =>
  network === "cardano:mainnet" ? 1 : 0;

/**
 * `networkId` alone can't disambiguate preprod from preview (both use 0) - callers
 * that need that distinction (e.g. a facilitator serving both testnets) must track
 * it separately from `networkId`. This picks preprod as the conventional default.
 */
export const fromNetworkId = (
  networkId: 0 | 1,
  testnet: "cardano:preprod" | "cardano:preview" = "cardano:preprod",
): CardanoNetwork => (networkId === 1 ? "cardano:mainnet" : testnet);
