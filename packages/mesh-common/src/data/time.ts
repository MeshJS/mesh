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

/**
 * Resolve when the epoch containing a timestamp ends, i.e. when the next one starts.
 * Epoch and slot lengths come from the network's genesis and only change by hard fork.
 * @param network Network: mainnet | preprod | preview.
 * @param milliseconds Timestamp in milliseconds
 * @returns Unix time in milliseconds of the next epoch boundary
 */
export const resolveEpochEnd = (
  network: Network,
  milliseconds = Date.now(),
): number => {
  const { zeroTime, slotLength, epochLength } = SLOT_CONFIG_NETWORK[network];
  const epochMs = epochLength * slotLength;
  if (epochMs <= 0)
    throw new Error(`No epoch length is known for network ${network}`);
  return (
    zeroTime + (Math.floor((milliseconds - zeroTime) / epochMs) + 1) * epochMs
  );
};

/**
 * A network's identity and slot clock in one value, so that "which addresses belong here" and
 * "which slot is this time" are never answered from two choices.
 */
export type NetworkConfig = {
  /** `"mainnet"`, `"preprod"`, `"preview"`, or the name of a custom network */
  readonly name: string;
  /** The network id in addresses: 1 on mainnet, 0 on every test network */
  readonly networkId: 0 | 1;
  /** The slot clock time bounds and time locks are converted with; `slotLength` is positive */
  readonly slotConfig: SlotConfig;
  /** The network magic, when known. Not checked yet: no provider states its magic */
  readonly magic?: number;
};

/** A public network by name, or a network's config */
export type NetworkInput = "mainnet" | "preprod" | "preview" | NetworkConfig;

const PUBLIC_NETWORK_MAGIC = {
  mainnet: 764824073,
  preprod: 1,
  preview: 2,
} as const;

/**
 * The config of a public network, or the given config as it is. A public network's config
 * carries its magic: 764824073 for mainnet, 1 for preprod, 2 for preview. `"testnet"`, whose
 * slot clock in `SLOT_CONFIG_NETWORK` is all zeros, is not accepted.
 * @throws Error for a name that is not `"mainnet"`, `"preprod"` or `"preview"`
 */
export function networkConfig(network: NetworkInput): NetworkConfig {
  if (typeof network === "object" && network !== null) return network;
  if (network === "mainnet" || network === "preprod" || network === "preview") {
    return {
      name: network,
      networkId: network === "mainnet" ? 1 : 0,
      // A copy, so that a change to the result never reaches the shared table
      slotConfig: { ...SLOT_CONFIG_NETWORK[network] },
      magic: PUBLIC_NETWORK_MAGIC[network],
    };
  }
  throw new Error(
    `Unknown network ${String(network)}: expected "mainnet", "preprod", "preview" or a config from customNetwork(...)`,
  );
}

/**
 * The config of a custom network (a devnet) from its Shelley genesis. Its name is `"custom"`
 * and its network id 0 unless given, its magic is left out unless given, and the epochs of its
 * slot clock count from 0.
 * @param params.systemStart Genesis `systemStart`: ISO text, POSIX ms or a Date
 * @param params.slotLengthMs Milliseconds per slot (genesis `slotLength` * 1000)
 * @param params.zeroSlot The slot at `systemStart`; 0 for a network without a Byron era
 * @throws Error for a slot length that is not a positive integer, or a `systemStart` that does
 * not give a finite time
 */
export function customNetwork(params: {
  name?: string;
  networkId?: 0 | 1;
  magic?: number;
  systemStart: string | number | Date;
  slotLengthMs: number;
  epochLength: number;
  zeroSlot?: number;
}): NetworkConfig {
  const { systemStart, slotLengthMs } = params;
  if (!Number.isInteger(slotLengthMs) || slotLengthMs <= 0)
    throw new Error(
      `The slot length must be a positive integer of milliseconds, got ${slotLengthMs}`,
    );
  const zeroTime =
    systemStart instanceof Date
      ? systemStart.getTime()
      : typeof systemStart === "string"
        ? Date.parse(systemStart)
        : systemStart;
  if (typeof zeroTime !== "number" || !Number.isFinite(zeroTime))
    throw new Error(
      `The system start must give a finite time, got ${String(systemStart)}`,
    );
  const config: NetworkConfig = {
    name: params.name ?? "custom",
    networkId: params.networkId ?? 0,
    slotConfig: {
      zeroTime,
      zeroSlot: params.zeroSlot ?? 0,
      slotLength: slotLengthMs,
      startEpoch: 0,
      epochLength: params.epochLength,
    },
  };
  return params.magic === undefined
    ? config
    : { ...config, magic: params.magic };
}

/**
 * The slot containing a POSIX time (`"down"`, the default), or the first slot starting at or
 * after it (`"up"`). The answer follows the network's slot clock, which holds from the config's
 * `zeroTime` on: an earlier time gives a slot before `zeroSlot`.
 * @param time POSIX time in milliseconds, or a Date
 */
export function slotAt(
  network: NetworkInput,
  time: number | Date,
  round: "down" | "up" = "down",
): number {
  const { zeroTime, zeroSlot, slotLength } = networkConfig(network).slotConfig;
  const ms = time instanceof Date ? time.getTime() : time;
  const slots = (ms - zeroTime) / slotLength;
  return (round === "up" ? Math.ceil(slots) : Math.floor(slots)) + zeroSlot;
}

/**
 * The POSIX time in milliseconds at which a slot starts. The answer follows the network's slot
 * clock, which holds from the config's `zeroTime` on.
 */
export function timeAt(network: NetworkInput, slot: number | bigint): number {
  const { zeroTime, zeroSlot, slotLength } = networkConfig(network).slotConfig;
  return zeroTime + (Number(slot) - zeroSlot) * slotLength;
}
