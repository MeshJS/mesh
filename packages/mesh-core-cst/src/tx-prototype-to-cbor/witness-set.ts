import { Serialization } from "@cardano-sdk/core";
import { HexBlob } from "@cardano-sdk/util";

import type {
  RedeemerPrototype,
  TransactionWitnessSetPrototype,
} from "@meshsdk/common";

import {
  BootstrapWitness,
  CborSet,
  Ed25519PublicKeyHex,
  Ed25519SignatureHex,
  ExUnits,
  NativeScript,
  PlutusData,
  PlutusV1Script,
  PlutusV2Script,
  PlutusV3Script,
  Redeemer,
  RedeemerTag,
  Redeemers,
  TransactionWitnessSet,
  VkeyWitness,
} from "../types";
import { nativeScriptPrototypeToCardano } from "./native-script";
import { plutusDataVariantToCardano } from "./plutus-data";

/** Every `TransactionWitnessSet` field except `redeemers` is a `CborSet<Core, Class>`, not a
 * plain array — build one from already-constructed class instances. */
const toCborSet = <Core, Cls extends { toCore(): Core; toCbor(): HexBlob }>(
  items: Cls[],
  fromCore: (core: Core) => Cls,
): Serialization.CborSet<Core, Cls> => {
  const set = CborSet.fromCore<Core, Cls>([], fromCore);
  set.setValues(items);
  return set;
};

const REDEEMER_TAGS: Record<RedeemerPrototype["tag"]["type"], RedeemerTag> = {
  SPEND: RedeemerTag.Spend,
  MINT: RedeemerTag.Mint,
  CERT: RedeemerTag.Cert,
  REWARD: RedeemerTag.Reward,
  VOTE: RedeemerTag.Voting,
  VOTING_PROPOSAL: RedeemerTag.Proposing,
};

const redeemerPrototypeToCardano = (redeemer: RedeemerPrototype): Redeemer =>
  new Redeemer(
    REDEEMER_TAGS[redeemer.tag.type],
    BigInt(redeemer.index),
    plutusDataVariantToCardano(redeemer.data),
    new ExUnits(BigInt(redeemer.ex_units.mem), BigInt(redeemer.ex_units.steps)),
  );

export const transactionWitnessSetPrototypeToCardano = (
  ws: TransactionWitnessSetPrototype,
): TransactionWitnessSet => {
  const result = new TransactionWitnessSet();

  if (ws.vkeys?.length) {
    result.setVkeys(
      toCborSet(
        ws.vkeys.map(
          (vkw) => new VkeyWitness(Ed25519PublicKeyHex(vkw.vkey), Ed25519SignatureHex(vkw.signature)),
        ),
        VkeyWitness.fromCore,
      ),
    );
  }

  if (ws.native_scripts?.length) {
    result.setNativeScripts(
      toCborSet(ws.native_scripts.map(nativeScriptPrototypeToCardano), NativeScript.fromCore),
    );
  }

  if (ws.bootstraps?.length) {
    result.setBootstraps(
      toCborSet(
        ws.bootstraps.map(
          (b) =>
            new BootstrapWitness(
              Ed25519PublicKeyHex(b.vkey),
              Ed25519SignatureHex(b.signature),
              HexBlob(Buffer.from(b.chain_code).toString("hex")),
              HexBlob(Buffer.from(b.attributes).toString("hex")),
            ),
        ),
        BootstrapWitness.fromCore,
      ),
    );
  }

  // CDDL keys 3 / 6 / 7 map 1:1 onto CST's three version-specific setters. (An earlier revision
  // of the prototype had a single undifferentiated `plutus_scripts` list, forcing everything into
  // `plutusV1Scripts` and silently mis-typing V2/V3 scripts; the prototype now carries the CDDL's
  // three separate fields, so no version guessing is needed.)
  if (ws.plutus_v1_scripts?.length) {
    result.setPlutusV1Scripts(
      toCborSet(
        ws.plutus_v1_scripts.map((cbor) => PlutusV1Script.fromCbor(HexBlob(cbor))),
        PlutusV1Script.fromCore,
      ),
    );
  }

  if (ws.plutus_v2_scripts?.length) {
    result.setPlutusV2Scripts(
      toCborSet(
        ws.plutus_v2_scripts.map((cbor) => PlutusV2Script.fromCbor(HexBlob(cbor))),
        PlutusV2Script.fromCore,
      ),
    );
  }

  if (ws.plutus_v3_scripts?.length) {
    result.setPlutusV3Scripts(
      toCborSet(
        ws.plutus_v3_scripts.map((cbor) => PlutusV3Script.fromCbor(HexBlob(cbor))),
        PlutusV3Script.fromCore,
      ),
    );
  }

  if (ws.plutus_data?.elems.length) {
    result.setPlutusData(
      toCborSet(
        ws.plutus_data.elems.map((cbor) => PlutusData.fromCbor(HexBlob(cbor))),
        PlutusData.fromCore,
      ),
    );
  }

  if (ws.redeemers?.length) {
    result.setRedeemers(Redeemers.fromCore(ws.redeemers.map((r) => redeemerPrototypeToCardano(r).toCore())));
  }

  return result;
};
