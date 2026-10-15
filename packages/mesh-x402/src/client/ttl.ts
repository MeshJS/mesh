import { secondsToSlots } from "../chain";
import { tryNormalizeCardanoNetwork } from "../types/network";
import { PaymentRequirements } from "../types/payment-requirements";

/** Share of `maxTimeoutSeconds` the client's TTL uses; the rest is headroom for clock/slot skew so the facilitator never sees `TTL_TOO_FAR`. */
const TTL_SAFETY_FRACTION = 0.9;

/** The TTL slot for a payment: `currentSlot` plus (most of) `maxTimeoutSeconds`, converted with the network's slot length. */
export const paymentTtlSlot = (
  requirement: PaymentRequirements,
  currentSlot: number,
): number =>
  currentSlot +
  secondsToSlots(
    tryNormalizeCardanoNetwork(requirement.network)!,
    Math.floor(requirement.maxTimeoutSeconds * TTL_SAFETY_FRACTION),
  );
