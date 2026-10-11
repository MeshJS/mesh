import type { NativeScriptPrototype } from "@meshsdk/common";

import {
  NativeScript,
  RequireAllOf,
  RequireAnyOf,
  RequireNOf,
  RequireSignature,
  RequireTimeAfter,
  RequireTimeBefore,
} from "../types";

/** Inverse of `../tx-prototype-to-cbor/native-script.ts`. */
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
          // Widened back to the CDDL's `int64` domain. The encoder narrowed to `number` at the
          // Mesh-type boundary, so a value above 2^53 does not survive a full round trip — see
          // the narrowing comment in ../tx-prototype-to-cbor/native-script.ts.
          n: BigInt(nOfK.required()),
          native_scripts: nOfK.nativeScripts().map(nativeScriptToPrototype),
        },
      };
    }
    case RequireTimeAfter:
      return { type: "TIMELOCK_START", value: { slot: script.asTimelockStart()!.slot().toString() } };
    case RequireTimeBefore:
      return {
        type: "TIMELOCK_EXPIRY",
        value: { slot: script.asTimelockExpiry()!.slot().toString() },
      };
    default:
      throw new Error(`Unsupported native script kind: ${script.kind()}`);
  }
};
