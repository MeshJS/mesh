/**
 * Wall-clock <-> slot conversion. The spec forbids comparing seconds against slots as raw
 * values or assuming one slot per second (rule 7), so every TTL/deadline comparison goes
 * through the network's slot configuration (system start + slot length) instead.
 */
import {
  SLOT_CONFIG_NETWORK,
  slotToBeginUnixTime,
  unixTimeToEnclosingSlot,
} from "@meshsdk/common";

import { CardanoNetwork } from "./types/network";

const slotConfig = (network: CardanoNetwork) =>
  SLOT_CONFIG_NETWORK[
    network.slice("cardano:".length) as "mainnet" | "preprod" | "preview"
  ];

/** Start of `slot` in POSIX milliseconds. */
export const slotToUnixMs = (network: CardanoNetwork, slot: number): number =>
  slotToBeginUnixTime(slot, slotConfig(network));

/** The slot enclosing `unixMs`. */
export const unixMsToSlot = (network: CardanoNetwork, unixMs: number): number =>
  unixTimeToEnclosingSlot(unixMs, slotConfig(network));

/** How many slots fit into `seconds` on `network` (rounded down). */
export const secondsToSlots = (
  network: CardanoNetwork,
  seconds: number,
): number => Math.floor((seconds * 1000) / slotConfig(network).slotLength);
