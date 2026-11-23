import type { NativeScriptPrototype } from "@meshsdk/common";

import { CborWriter, Ed25519KeyHashHex, HexBlob, NativeScript as CstNativeScript } from "../types";

/** The kind of a native script, the first item of its array */
const KIND: Record<NativeScriptPrototype["type"], number> = {
  SCRIPT_PUBKEY: 0,
  SCRIPT_ALL: 1,
  SCRIPT_ANY: 2,
  SCRIPT_N_OF_K: 3,
  TIMELOCK_START: 4,
  TIMELOCK_EXPIRY: 5,
};

/** A whole number in decimal digits, as a prototype holds a slot */
const WHOLE_NUMBER = /^-?\d+$/;

/**
 * Writes a native script from its structure as the SDK's classes write one: each array of
 * definite length, each integer in its shortest form. The slot of a time lock and the `n` of an
 * n-of-k script are written exactly, never through a Number, which is not exact above 2^53
 */
const writeNativeScript = (writer: CborWriter, proto: NativeScriptPrototype): void => {
  switch (proto.type) {
    case "SCRIPT_PUBKEY":
      writer.writeStartArray(2);
      writer.writeInt(KIND.SCRIPT_PUBKEY);
      writer.writeByteString(Buffer.from(Ed25519KeyHashHex(proto.value.addr_keyhash), "hex"));
      return;
    case "SCRIPT_ALL":
    case "SCRIPT_ANY":
    case "SCRIPT_N_OF_K": {
      const scripts = proto.value.native_scripts;
      writer.writeStartArray(proto.type === "SCRIPT_N_OF_K" ? 3 : 2);
      writer.writeInt(KIND[proto.type]);
      if (proto.type === "SCRIPT_N_OF_K") writer.writeInt(BigInt(proto.value.n));
      writer.writeStartArray(scripts.length);
      for (const script of scripts) writeNativeScript(writer, script);
      return;
    }
    case "TIMELOCK_START":
    case "TIMELOCK_EXPIRY": {
      const slot = String(proto.value.slot);
      if (!WHOLE_NUMBER.test(slot)) throw new Error("the slot of a time lock is not a whole number");
      writer.writeStartArray(2);
      writer.writeInt(KIND[proto.type]);
      writer.writeInt(BigInt(slot));
      return;
    }
    default:
      throw new Error("Unsupported native script type");
  }
};

/** A native script of a prototype: from the CBOR it was given in, when it holds that, so that it
 * keeps those bytes and the hash taken over them; else written from its structure
 * (`writeNativeScript`), its slots and `n` exactly */
export const nativeScriptPrototypeToCardano = (proto: NativeScriptPrototype): CstNativeScript => {
  if (proto.cbor !== undefined) return CstNativeScript.fromCbor(HexBlob(proto.cbor));
  const writer = new CborWriter();
  writeNativeScript(writer, proto);
  return CstNativeScript.fromCbor(writer.encodeAsHex());
};
