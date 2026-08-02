import type {
  NativeScript,
  NativeScriptPrototype,
} from "@meshsdk/common";

import type { NativeScript as CstNativeScript } from "../types";
import { toNativeScript } from "../utils";

const meshNativeScript = (proto: NativeScriptPrototype): NativeScript => {
  switch (proto.type) {
    case "SCRIPT_PUBKEY":
      return { type: "sig", keyHash: proto.value.addr_keyhash };
    case "SCRIPT_ALL":
      return { type: "all", scripts: proto.value.native_scripts.map(meshNativeScript) };
    case "SCRIPT_ANY":
      return { type: "any", scripts: proto.value.native_scripts.map(meshNativeScript) };
    case "SCRIPT_N_OF_K":
      return {
        type: "atLeast",
        // Narrowing boundary: the prototype carries the CDDL-legal `int64` range as bigint, but
        // Mesh's own `NativeScript`/`atLeast.required` is `number`. Lossy only above 2^53, which
        // for "n of k signatures required" cannot occur in any real script.
        required: Number(proto.value.n),
        scripts: proto.value.native_scripts.map(meshNativeScript),
      };
    case "TIMELOCK_START":
      return { type: "after", slot: proto.value.slot };
    case "TIMELOCK_EXPIRY":
      return { type: "before", slot: proto.value.slot };
  }
};

export const nativeScriptPrototypeToCardano = (
  proto: NativeScriptPrototype,
): CstNativeScript => toNativeScript(meshNativeScript(proto));
