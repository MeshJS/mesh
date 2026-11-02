import {
  DatumSource,
  MintParam,
  Output,
  PlutusScript,
  PubKeyTxIn,
  RefTxIn,
  ScriptTxInParameter,
  ScriptWithdrawal,
  SimpleScriptTxInParameter,
  SimpleScriptWithdrawal,
  TxIn,
  TxInParameter,
  UTxO,
  Withdrawal,
} from "@meshsdk/common";

import {
  Address,
  AssetId,
  CredentialType,
  DatumKind,
  RedeemerTag,
} from "../types";
import { fromValue } from "../utils/converter";
import {
  addressToString,
  compareCredentials,
  paymentCredentialOf,
  toResolvedScript,
  TxParserContext,
} from "./context";

type TxInRef = { txHash: string; txIndex: number };

const txInRefOf = (input: {
  transactionId(): { toString(): string };
  index(): bigint;
}): TxInRef => ({
  txHash: input.transactionId().toString(),
  txIndex: Number(input.index()),
});

/** The ledger orders inputs by (transaction id, index); spend redeemer indexes refer to that order */
const compareTxInRefs = (a: TxInRef, b: TxInRef): number =>
  a.txHash < b.txHash ? -1 : a.txHash > b.txHash ? 1 : a.txIndex - b.txIndex;

const datumSourceOf = (
  ctx: TxParserContext,
  utxo: UTxO,
): DatumSource | undefined => {
  if (utxo.output.plutusData) {
    return {
      type: "Inline",
      txHash: utxo.input.txHash,
      txIndex: utxo.input.outputIndex,
    };
  }
  if (utxo.output.dataHash) {
    const witnessDatum = ctx.getWitnessDatum(utxo.output.dataHash);
    if (witnessDatum) {
      return {
        type: "Provided",
        data: { type: "CBOR", content: witnessDatum },
      };
    }
  }
  return undefined;
};

export const parseInputs = (ctx: TxParserContext): TxIn[] => {
  const inputs = ctx.body
    .inputs()
    .values()
    .map(txInRefOf)
    .sort(compareTxInRefs);
  return inputs.map(({ txHash, txIndex }, index) => {
    const utxo = ctx.requireUtxo(txHash, txIndex, "input");
    const txIn: TxInParameter = {
      txHash,
      txIndex,
      amount: utxo.output.amount,
      address: utxo.output.address,
    };
    const credential = paymentCredentialOf(utxo.output.address);
    if (!credential || credential.type !== CredentialType.ScriptHash) {
      return { type: "PubKey", txIn };
    }
    const witness = ctx.scriptWitnessFor(credential, RedeemerTag.Spend, index);
    if (witness.redeemer || witness.plutusSource) {
      const scriptTxIn: ScriptTxInParameter = {};
      if (witness.plutusSource) scriptTxIn.scriptSource = witness.plutusSource;
      const datumSource = datumSourceOf(ctx, utxo);
      if (datumSource) scriptTxIn.datumSource = datumSource;
      if (witness.redeemer) scriptTxIn.redeemer = witness.redeemer;
      return { type: "Script", txIn, scriptTxIn };
    }
    // A script input without a redeemer can only be locked by a native script
    const simpleScriptTxIn: SimpleScriptTxInParameter = {};
    if (witness.simpleSource)
      simpleScriptTxIn.scriptSource = witness.simpleSource;
    return { type: "SimpleScript", txIn, simpleScriptTxIn };
  });
};

export const parseCollaterals = (ctx: TxParserContext): PubKeyTxIn[] =>
  (ctx.body.collateral()?.values() ?? []).map((input) => {
    const { txHash, txIndex } = txInRefOf(input);
    const utxo = ctx.requireUtxo(txHash, txIndex, "collateral");
    return {
      type: "PubKey",
      txIn: {
        txHash,
        txIndex,
        amount: utxo.output.amount,
        address: utxo.output.address,
      },
    };
  });

export const parseReferenceInputs = (ctx: TxParserContext): RefTxIn[] =>
  (ctx.body.referenceInputs()?.values() ?? []).map((input) => {
    const refTxIn: RefTxIn = txInRefOf(input);
    const scriptRef = ctx.getUtxo(refTxIn.txHash, refTxIn.txIndex)?.output
      .scriptRef;
    if (scriptRef) refTxIn.scriptSize = scriptRef.length / 2;
    return refTxIn;
  });

export const parseOutputs = (ctx: TxParserContext): Output[] =>
  ctx.body.outputs().map((output) => {
    const result: Output = {
      address: addressToString(output.address()),
      amount: fromValue(output.amount()),
    };

    const datum = output.datum();
    if (datum) {
      if (datum.kind() === DatumKind.InlineData) {
        result.datum = {
          type: "Inline",
          data: {
            type: "CBOR",
            content: datum.asInlineData()!.toCbor().toString(),
          },
        };
      } else {
        // A datum hash whose datum travels in the witness set is what MeshTxBuilder calls
        // an embedded datum, unless a spent input already supplies that datum: embedding
        // it again would list it twice in the rebuilt witness set. Without the datum
        // only the hash itself is known.
        const dataHash = datum.asDataHash()!.toString();
        const witnessDatum = ctx.getWitnessDatum(dataHash);
        if (!witnessDatum) {
          result.datum = {
            type: "Hash",
            data: { type: "CBOR", content: dataHash },
          };
        } else if (ctx.isDatumProvidedByInput(dataHash)) {
          result.datum = {
            type: "Hash",
            data: { type: "CBOR", content: witnessDatum },
          };
        } else {
          result.datum = {
            type: "Embedded",
            data: { type: "CBOR", content: witnessDatum },
          };
        }
      }
    }

    const scriptRef = output.scriptRef();
    if (scriptRef) {
      const resolved = toResolvedScript(scriptRef);
      result.referenceScript =
        resolved.kind === "plutus"
          ? { code: resolved.code, version: resolved.version }
          : // `Output.referenceScript` is typed as a Plutus script, but the serializer
            // treats any other version marker as a native script
            ({
              code: resolved.code,
              version: "Native",
            } as unknown as PlutusScript);
    }

    return result;
  });

export const parseMints = (ctx: TxParserContext): MintParam[] => {
  const mint = ctx.body.mint();
  if (!mint || mint.size === 0) return [];

  const byPolicy = new Map<string, MintParam["mintValue"]>();
  for (const [assetId, quantity] of mint) {
    const policyId = AssetId.getPolicyId(assetId).toString();
    const assetName = AssetId.getAssetName(assetId).toString();
    const mintValue = byPolicy.get(policyId) ?? [];
    mintValue.push({ assetName, amount: quantity.toString() });
    byPolicy.set(policyId, mintValue);
  }

  // Mint redeemer indexes refer to the policy ids in their (byte-wise) sorted order
  return [...byPolicy.keys()].sort().map((policyId, index) => {
    const mintValue = byPolicy.get(policyId)!;
    const witness = ctx.scriptWitnessFor(
      { type: CredentialType.ScriptHash, hash: policyId as never },
      RedeemerTag.Mint,
      index,
    );
    if (witness.redeemer || witness.plutusSource) {
      const mintParam: MintParam = { type: "Plutus", policyId, mintValue };
      if (witness.redeemer) mintParam.redeemer = witness.redeemer;
      if (witness.plutusSource) mintParam.scriptSource = witness.plutusSource;
      return mintParam;
    }
    const mintParam: MintParam = { type: "Native", policyId, mintValue };
    if (witness.simpleSource) mintParam.scriptSource = witness.simpleSource;
    return mintParam;
  });
};

export const parseWithdrawals = (ctx: TxParserContext): Withdrawal[] => {
  const withdrawals = ctx.body.withdrawals();
  if (!withdrawals) return [];

  // Reward redeemer indexes refer to the reward accounts in the order the ledger keeps
  // them: script credentials before key credentials, then by hash
  const entries = [...withdrawals.entries()]
    .map(([rewardAccount, coin]) => {
      const credential =
        Address.fromBech32(rewardAccount).getProps().paymentPart;
      if (!credential) {
        throw new Error(
          `Cannot parse transaction: invalid reward account ${rewardAccount}`,
        );
      }
      return {
        address: rewardAccount.toString(),
        coin: coin.toString(),
        credential,
      };
    })
    .sort((a, b) => compareCredentials(a.credential, b.credential));

  return entries.map(({ address, coin, credential }, index) => {
    if (credential.type !== CredentialType.ScriptHash) {
      return { type: "PubKeyWithdrawal", address, coin };
    }
    const witness = ctx.scriptWitnessFor(credential, RedeemerTag.Reward, index);
    if (witness.redeemer || witness.plutusSource) {
      const withdrawal: ScriptWithdrawal = {
        type: "ScriptWithdrawal",
        address,
        coin,
      };
      if (witness.plutusSource) withdrawal.scriptSource = witness.plutusSource;
      if (witness.redeemer) withdrawal.redeemer = witness.redeemer;
      return withdrawal;
    }
    const withdrawal: SimpleScriptWithdrawal = {
      type: "SimpleScriptWithdrawal",
      address,
      coin,
    };
    if (witness.simpleSource) withdrawal.scriptSource = witness.simpleSource;
    return withdrawal;
  });
};
