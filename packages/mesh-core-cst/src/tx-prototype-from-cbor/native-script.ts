import type { NativeScriptPrototype } from "@meshsdk/common";

import {
  CborReader,
  HexBlob,
  NativeScript,
  RequireAllOf,
  RequireAnyOf,
  RequireNOf,
  RequireSignature,
  RequireTimeAfter,
  RequireTimeBefore,
} from "../types";

/**
 * The integer after the kind of a native script, `[kind, int, ...]`, read from the script's own
 * bytes as they are written: the slot of a time lock, the `n` of an n-of-k script. The SDK's
 * classes hold it as a Number, which is not exact above 2^53
 */
const integerAfterKind = (cbor: HexBlob): bigint => {
  const reader = new CborReader(cbor);
  reader.readStartArray();
  reader.readInt();
  return reader.readInt();
};

/** Inverse of `../tx-prototype-to-cbor/native-script.ts`; the slots and `n` exact. */
export const nativeScriptToPrototype = (script: NativeScript): NativeScriptPrototype => {
  switch (script.kind()) {
    case RequireSignature:
      return {
        type: "SCRIPT_PUBKEY",
        value: { addr_keyhash: script.asScriptPubkey()!.keyHash().toString() },
      };
    case RequireAllOf:
      return {
        type: "SCRIPT_ALL",
        value: { native_scripts: script.asScriptAll()!.nativeScripts().map(nativeScriptToPrototype) },
      };
    case RequireAnyOf:
      return {
        type: "SCRIPT_ANY",
        value: { native_scripts: script.asScriptAny()!.nativeScripts().map(nativeScriptToPrototype) },
      };
    case RequireNOf: {
      const nOfK = script.asScriptNOfK()!;
      return {
        type: "SCRIPT_N_OF_K",
        value: {
          // The CDDL's `int64` domain, read from the bytes: the SDK's `required()` is a Number
          n: integerAfterKind(nOfK.toCbor()),
          native_scripts: nOfK.nativeScripts().map(nativeScriptToPrototype),
        },
      };
    }
    case RequireTimeAfter:
      return {
        type: "TIMELOCK_START",
        value: { slot: integerAfterKind(script.asTimelockStart()!.toCbor()).toString() },
      };
    case RequireTimeBefore:
      return {
        type: "TIMELOCK_EXPIRY",
        value: { slot: integerAfterKind(script.asTimelockExpiry()!.toCbor()).toString() },
      };
    default:
      throw new Error(`Unsupported native script kind: ${script.kind()}`);
  }
};
