import { Protocol } from "@meshsdk/common";

export type ChainState = { protocol: Protocol; currentSlot: number };

/** The slice of a Mesh provider (e.g. `BlockfrostProvider`) needed to read live chain state. */
export type ChainStateProvider = {
  fetchProtocolParameters(epoch?: number): Promise<Protocol>;
  fetchLatestBlock(): Promise<{ slot: string | number }>;
};

/**
 * Builds the `() => Promise<{ protocol, currentSlot }>` both sides need: `ChainContext` for the
 * client and `resolveChainState` for the facilitator. Reads the tip fresh on every call.
 */
export const chainStateFrom =
  (provider: ChainStateProvider) => async (): Promise<ChainState> => {
    const [protocol, latest] = await Promise.all([
      provider.fetchProtocolParameters(),
      provider.fetchLatestBlock(),
    ]);
    return { protocol, currentSlot: Number(latest.slot) };
  };
