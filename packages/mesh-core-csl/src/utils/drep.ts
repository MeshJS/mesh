import base32 from "base32-encoding";
import { bech32 } from "bech32";

import { csl } from "../deser";

export const getDRepIds = (
  dRepId: string,
): {
  cip105: string;
  cip129: string;
} => {
  let result = {
    cip105: "",
    cip129: "",
  };
  if (dRepId.length === 58) {
    result.cip129 = dRepId;
    const { prefix, words } = bech32.decode(dRepId);
    if (prefix !== "drep") {
      throw new Error("Malformed CIP129 DRepId");
    }
    const bytes = base32.decode(new Uint8Array(words));
    if (bytes[0] === 0x22) {
      result.cip105 = csl.DRep.new_key_hash(
        csl.Ed25519KeyHash.from_hex(bytes.subarray(1).toString("hex")),
      ).to_bech32();
    } else if (bytes[0] === 0x23) {
      result.cip105 = csl.DRep.new_script_hash(
        csl.ScriptHash.from_hex(bytes.subarray(1).toString("hex")),
      ).to_bech32();
    } else {
      throw new Error("Malformed CIP129 DRepId");
    }
  } else {
    result.cip105 = dRepId;
    try {
      const cslDRep = csl.DRep.from_bech32(dRepId);
      if (cslDRep.kind() === csl.DRepKind.KeyHash) {
        let rawBytes = cslDRep.to_key_hash()?.to_bytes();
        if (!rawBytes) {
          throw new Error("Malformed key hash in DRepId");
        }
        let rawBytesWithPrefix = new Uint8Array(rawBytes.length + 1);
        rawBytesWithPrefix.set([0x22]);
        rawBytesWithPrefix.set(rawBytes, 1);
        let base32RawBytes = base32.encode(rawBytesWithPrefix);
        result.cip129 = bech32.encode("drep", base32RawBytes);
      } else if (cslDRep.kind() === csl.DRepKind.ScriptHash) {
        let rawBytes = cslDRep.to_script_hash()?.to_bytes();
        if (!rawBytes) {
          throw new Error("Malformed script hash in DRepId");
        }
        let rawBytesWithPrefix = new Uint8Array(rawBytes.length + 1);
        rawBytesWithPrefix.set([0x23]);
        rawBytesWithPrefix.set(rawBytes, 1);
        let base32RawBytes = base32.encode(rawBytesWithPrefix);
        result.cip129 = bech32.encode("drep", base32RawBytes);
      } else {
        throw new Error("Can only calculate DRepIds for script/key DReps");
      }
    } catch (e) {
      console.error(e);
      throw new Error("Malformed DRepId");
    }
  }
  return result;
};
