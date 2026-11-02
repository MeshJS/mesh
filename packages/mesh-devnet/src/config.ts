/**
 * Devnet configuration.
 *
 * NETWORK_MAGIC and NETWORK_ID identify *which* chain a transaction targets.
 *   • NETWORK_ID  ∈ {0, 1}      — encoded in every Shelley address byte 0,
 *                                 used by `validateNetworkId` in cardano-ledger.
 *                                 0 → testnet bech32 (addr_test1…), 1 → mainnet.
 *   • NETWORK_MAGIC ∈ uint32    — exchanged at the Ouroboros handshake; we
 *                                 surface it via /tip and /params so that
 *                                 wallets refuse to talk to the wrong chain.
 *
 * Defaults match yaci-devkit's local devnet (magic 42, testnet addresses) so
 * tooling that already understands "yaci" can point at us with no changes.
 *
 * Protocol parameters mirror Conway-era preview/preprod values; transactions
 * built and validated here pass on those testnets unchanged.
 */

export const NETWORK_MAGIC = Number(process.env.CARDANO_DEVNET_MAGIC ?? 42);
export const NETWORK_ID    = Number(process.env.CARDANO_DEVNET_NETWORK_ID ?? 0); // 0 = testnet, 1 = mainnet

if (NETWORK_ID !== 0 && NETWORK_ID !== 1) {
  throw new Error(`CARDANO_DEVNET_NETWORK_ID must be 0 or 1, got ${NETWORK_ID}`);
}

export interface ProtocolParams {
  // ── Fee calculation: minFee = minFeeA * txBytes + minFeeB ─────────────
  minFeeA: number;           // lovelace per serialised byte
  minFeeB: number;           // flat lovelace constant

  // ── Size limits ────────────────────────────────────────────────────────
  maxTxSize:          number; // bytes
  maxBlockSize:       number; // bytes
  maxBlockHeaderSize: number; // bytes
  maxValSize:         number; // max serialised multi-asset value bytes

  // ── Min-UTxO: Conway formula ───────────────────────────────────────────
  // minADA = coinsPerUTxOByte × (utxoEntrySizeWithoutVal + outputSize)
  coinsPerUTxOByte: number;

  // ── Deposits ───────────────────────────────────────────────────────────
  keyDeposit:  bigint; // stake key registration deposit
  poolDeposit: bigint; // stake pool registration deposit

  // ── Execution units (for script txs — devnet accepts any value) ────────
  maxTxExMem:    bigint;
  maxTxExSteps:  bigint;
  priceMem:      number; // lovelace per mem unit
  priceStep:     number; // lovelace per cpu step

  // ── Collateral ─────────────────────────────────────────────────────────
  collateralPercent:    number;
  maxCollateralInputs:  number;

  // ── Devnet timing (not part of on-chain params) ────────────────────────
  slotLengthMs: number; // milliseconds per slot (devnet: 1 000)
  epochLength:  number; // slots per epoch       (devnet: 100)

  // ── Era ────────────────────────────────────────────────────────────────
  protocolMajorVersion: number;
  protocolMinorVersion: number;

  // ── Reference-script cost (Conway) ─────────────────────────────────────
  minFeeRefScriptCostPerByte: number;
}

// Conway-era parameters matching Preview / Pre-Production testnets.
// Transactions built against these values are valid on testnets.
export const PROTOCOL_PARAMS: ProtocolParams = {
  minFeeA:            44,
  minFeeB:            155_381,

  maxTxSize:          16_384,
  maxBlockSize:       65_536,
  maxBlockHeaderSize: 1_100,
  maxValSize:         5_000,

  coinsPerUTxOByte:   4_310,

  keyDeposit:         2_000_000n,
  poolDeposit:        500_000_000n,

  maxTxExMem:         14_000_000n,
  maxTxExSteps:       10_000_000_000n,
  priceMem:           0.0577,
  priceStep:          0.0000721,

  collateralPercent:   150,
  maxCollateralInputs: 3,

  // Fast devnet: 1-second slots, 100-slot epochs
  slotLengthMs: 1_000,
  epochLength:  100,

  protocolMajorVersion: 10, // Conway
  protocolMinorVersion:  0,

  minFeeRefScriptCostPerByte: 15,
};
