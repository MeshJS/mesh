import { Network } from "../types";

export type SlotConfig = {
  zeroTime: number;
  zeroSlot: number;
  slotLength: number; // number of milliseconds.
  startEpoch: number;
  epochLength: number;
};

// export const SUPPORTED_CLOCKS: Record<
//   Network,
//   [epoch: string, slot: string, systemStart: string, epochLength: string]
// > = {
//   testnet: ["74", "1598400", "1595967616", "432000"],
//   preview: ["183", "15811222", "1682467200", "86400"],
//   preprod: ["65", "26438400", "1682121600", "432000"],
//   mainnet: ["208", "4492800", "1596059091", "432000"],
// };

export const SLOT_CONFIG_NETWORK: Record<Network, SlotConfig> = {
  mainnet: {
    zeroTime: 1596059091000,
    zeroSlot: 4492800,
    slotLength: 1000,
    startEpoch: 208,
    epochLength: 432000,
  }, // Starting at Shelley era
  preview: {
    zeroTime: 1666656000000,
    zeroSlot: 0,
    slotLength: 1000,
    startEpoch: 0,
    epochLength: 86400,
  }, // Starting at Shelley era
  preprod: {
    zeroTime: 1654041600000 + 1728000000,
    zeroSlot: 86400,
    slotLength: 1000,
    startEpoch: 4,
    epochLength: 432000,
  }, // Starting at Shelley era
  /** Customizable slot config (Initialized with 0 values). */
  testnet: {
    zeroTime: 0,
    zeroSlot: 0,
    slotLength: 0,
    startEpoch: 0,
    epochLength: 0,
  },
};

export const slotToBeginUnixTime = (
  slot: number,
  slotConfig: SlotConfig,
): number => {
  const msAfterBegin = (slot - slotConfig.zeroSlot) * slotConfig.slotLength;
  return slotConfig.zeroTime + msAfterBegin;
};

/**
 * Eqivalent to `slotToBeginUnixTime` but option to provide optional config
 * @param unixTime Timestamp in milliseconds
 * @param slotConfig Slot configuration for calculation
 * @returns Slot number
 */
export const unixTimeToEnclosingSlot = (
  unixTime: number,
  slotConfig: SlotConfig,
): number => {
  const timePassed = unixTime - slotConfig.zeroTime;
  const slotsPassed = Math.floor(timePassed / slotConfig.slotLength);
  return slotsPassed + slotConfig.zeroSlot;
};

/**
 * Resolve slot number based on timestamp in milliseconds.
 * @param network Network: mainnet | preprod | preview.
 * @param milliseconds Timestamp in milliseconds
 * @returns Slot number
 */
export const resolveSlotNo = (
  network: Network,
  milliseconds = Date.now(),
): string => {
  return unixTimeToEnclosingSlot(
    milliseconds,
    SLOT_CONFIG_NETWORK[network],
  ).toString();
};

/**
 * Resolve epoch number based on timestamp in  milliseconds.
 * @param network Network: mainnet | preprod | preview.
 * @param milliseconds Timestamp in milliseconds
 * @returns Epoch number
 */
export const resolveEpochNo = (
  network: Network,
  milliseconds = Date.now(),
): number => {
  const config = SLOT_CONFIG_NETWORK[network];

  const msBigInt = BigInt(milliseconds);
  const epoch =
    (msBigInt - BigInt(config.zeroTime)) / 1000n / BigInt(config.epochLength) +
    BigInt(config.startEpoch);

  return Number(epoch);
};
