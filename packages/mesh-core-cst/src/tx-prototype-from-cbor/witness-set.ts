import type {
  RedeemerPrototype,
  RedeemerTagPrototype,
  TransactionWitnessSetPrototype,
} from "@meshsdk/common";

import { Redeemer, RedeemerTag, TransactionWitnessSet } from "../types";
import { nativeScriptToPrototype } from "./native-script";
import { plutusDataToPrototype } from "./plutus-data";

const TAGS: Record<number, RedeemerTagPrototype["type"]> = {
  [RedeemerTag.Spend]: "SPEND",
  [RedeemerTag.Mint]: "MINT",
  [RedeemerTag.Cert]: "CERT",
  [RedeemerTag.Reward]: "REWARD",
  [RedeemerTag.Voting]: "VOTE",
  [RedeemerTag.Proposing]: "VOTING_PROPOSAL",
};

const redeemerToPrototype = (redeemer: Redeemer): RedeemerPrototype => {
  const tag = TAGS[redeemer.tag()];
  if (!tag) throw new Error(`Unsupported redeemer tag: ${redeemer.tag()}`);
  return {
    tag: { type: tag },
    index: redeemer.index().toString(),
    data: { type: "MANUAL", data: plutusDataToPrototype(redeemer.data()) },
    ex_units: {
      mem: redeemer.exUnits().mem().toString(),
      steps: redeemer.exUnits().steps().toString(),
    },
  };
};

/** Inverse of `../tx-prototype-to-cbor/witness-set.ts`. Empty CST collections decode to an absent
 * field rather than an empty array, matching how the encoder treats `?.length` as key-absent. */
export const transactionWitnessSetToPrototype = (
  ws: TransactionWitnessSet,
): TransactionWitnessSetPrototype => {
  const result: TransactionWitnessSetPrototype = {};

  const vkeys = ws.vkeys();
  if (vkeys?.size()) {
    result.vkeys = [...vkeys.values()].map((v) => ({
      vkey: v.vkey().toString(),
      signature: v.signature().toString(),
    }));
  }

  const nativeScripts = ws.nativeScripts();
  if (nativeScripts?.size()) {
    result.native_scripts = [...nativeScripts.values()].map(nativeScriptToPrototype);
  }

  const bootstraps = ws.bootstraps();
  if (bootstraps?.size()) {
    result.bootstraps = [...bootstraps.values()].map((b) => ({
      vkey: b.vkey().toString(),
      signature: b.signature().toString(),
      chain_code: [...Buffer.from(b.chainCode().toString(), "hex")],
      attributes: [...Buffer.from(b.attributes().toString(), "hex")],
    }));
  }

  // CDDL keys 3 / 6 / 7 — kept separate, since the language version is not recoverable from the
  // script bytes and only the key records it.
  const v1 = ws.plutusV1Scripts();
  if (v1?.size()) result.plutus_v1_scripts = [...v1.values()].map((s) => s.toCbor().toString());
  const v2 = ws.plutusV2Scripts();
  if (v2?.size()) result.plutus_v2_scripts = [...v2.values()].map((s) => s.toCbor().toString());
  const v3 = ws.plutusV3Scripts();
  if (v3?.size()) result.plutus_v3_scripts = [...v3.values()].map((s) => s.toCbor().toString());

  const plutusData = ws.plutusData();
  if (plutusData?.size()) {
    result.plutus_data = {
      elems: [...plutusData.values()].map((d) => d.toCbor().toString()),
    };
  }

  const redeemers = ws.redeemers();
  if (redeemers?.size()) {
    result.redeemers = [...redeemers.values()].map(redeemerToPrototype);
  }

  return result;
};
