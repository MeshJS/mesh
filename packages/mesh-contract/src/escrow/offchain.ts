import {
  ConStr0,
  conStr0,
  ConStr1,
  conStr1,
  DEFAULT_REDEEMER_BUDGET,
  mConStr1,
  mConStr2,
  MeshValue,
  PubKeyAddress,
  pubKeyAddress,
  Value,
  value,
} from "@meshsdk/common";
import {
  Asset,
  deserializeAddress,
  deserializeDatum,
  mergeAssets,
  serializeAddressObj,
  UTxO,
} from "@meshsdk/core";
import { applyParamsToScript } from "@meshsdk/core-csl";

import { MeshTxInitiator, MeshTxInitiatorInput } from "../common";
import blueprintV1 from "./aiken-workspace-v1/plutus.json";
import blueprintV2 from "./aiken-workspace-v2/plutus.json";

export type InitiationDatum = ConStr0<[PubKeyAddress, Value]>;
export const initiateEscrowDatum = (
  walletAddress: string,
  amount: Asset[],
): InitiationDatum => {
  const { pubKeyHash, stakeCredentialHash } = deserializeAddress(walletAddress);
  return conStr0([
    pubKeyAddress(pubKeyHash, stakeCredentialHash),
    value(amount),
  ]);
};

export type ActiveEscrowDatum = ConStr1<
  [PubKeyAddress, Value, PubKeyAddress, Value]
>;
export const activeEscrowDatum = (
  initiationDatum: InitiationDatum,
  walletAddress: string,
  amount: Asset[],
): ActiveEscrowDatum => {
  const { pubKeyHash, stakeCredentialHash } = deserializeAddress(walletAddress);
  const [initiator, initiatorAmount] = initiationDatum.fields;
  return conStr1([
    initiator,
    initiatorAmount,
    pubKeyAddress(pubKeyHash, stakeCredentialHash),
    value(amount),
  ]);
};

export type RecipientDepositRedeemer = ConStr0<[PubKeyAddress, Value]>;
export const recipientDepositRedeemer = (
  recipient: string,
  depositAmount: Asset[],
) => initiateEscrowDatum(recipient, depositAmount);

export class MeshEscrowContract extends MeshTxInitiator {
  scriptCbor: string;
  scriptAddress: string;

  constructor(inputs: MeshTxInitiatorInput) {
    super(inputs);
    this.scriptCbor = this.getScriptCbor();
    this.scriptAddress = this.getScriptAddress(this.scriptCbor);
  }

  getScriptCbor = () => {
    switch (this.version) {
      case 2:
        return applyParamsToScript(blueprintV2.validators[0]!.compiledCode, []);
      default:
        return applyParamsToScript(blueprintV1.validators[0]!.compiledCode, []);
    }
  };

  initiateEscrow = async (escrowAmount: Asset[]): Promise<string> => {
    const { utxos, walletAddress } = await this.getWalletInfoForTx();

    await this.mesh
      .txOut(this.scriptAddress, escrowAmount)
      .txOutInlineDatumValue(
        initiateEscrowDatum(walletAddress, escrowAmount),
        "JSON",
      )
      .changeAddress(walletAddress)
      .selectUtxosFrom(utxos)
      .complete();
    return this.mesh.txHex;
  };

  cancelEscrow = async (escrowUtxo: UTxO): Promise<string> => {
    const { utxos, walletAddress, collateral } =
      await this.getWalletInfoForTx();

    const inputDatum = deserializeDatum<InitiationDatum | ActiveEscrowDatum>(
      escrowUtxo.output.plutusData!,
    );

    if (inputDatum.constructor === 1) {
      const [
        initiatorAddressObj,
        initiatorAmount,
        recipientAddressObj,
        recipientAmount,
      ] = inputDatum.fields;

      const initiatorAddress = serializeAddressObj(
        initiatorAddressObj,
        this.networkId,
      );
      const recipientAddress = serializeAddressObj(
        recipientAddressObj!,
        this.networkId,
      );
      const initiatorToReceive =
        MeshValue.fromValue(initiatorAmount).toAssets();
      const recipientToReceive = MeshValue.fromValue(
        recipientAmount!,
      ).toAssets();
      this.mesh
        .txOut(initiatorAddress, initiatorToReceive)
        .txOut(recipientAddress, recipientToReceive);
    }

    await this.mesh
      .spendingPlutusScript(this.languageVersion)
      .txIn(
        escrowUtxo.input.txHash,
        escrowUtxo.input.outputIndex,
        escrowUtxo.output.amount,
        this.scriptAddress,
      )
      .spendingReferenceTxInInlineDatumPresent()
      .spendingReferenceTxInRedeemerValue(mConStr1([]))
      .txInScript(this.scriptCbor)
      .requiredSignerHash(deserializeAddress(walletAddress).pubKeyHash)
      .changeAddress(walletAddress)
      .txInCollateral(
        collateral.input.txHash,
        collateral.input.outputIndex,
        collateral.output.amount,
        collateral.output.address,
      )
      .selectUtxosFrom(utxos)
      .complete();
    return this.mesh.txHex;
  };

  recipientDeposit = async (
    escrowUtxo: UTxO,
    depositAmount: Asset[],
  ): Promise<string> => {
    const { utxos, walletAddress, collateral } =
      await this.getWalletInfoForTx();

    const inputDatum = deserializeDatum<InitiationDatum>(
      escrowUtxo.output.plutusData!,
    );
    const outputDatum = activeEscrowDatum(
      inputDatum,
      walletAddress,
      depositAmount,
    );

    const inputAssets = MeshValue.fromValue(inputDatum.fields[1]).toAssets();
    const escrowAmount = mergeAssets([...depositAmount, ...inputAssets]);

    await this.mesh
      .spendingPlutusScript(this.languageVersion)
      .txIn(
        escrowUtxo.input.txHash,
        escrowUtxo.input.outputIndex,
        escrowUtxo.output.amount,
        this.scriptAddress,
      )
      .spendingReferenceTxInInlineDatumPresent()
      .txInRedeemerValue(
        recipientDepositRedeemer(walletAddress, depositAmount),
        "JSON",
        DEFAULT_REDEEMER_BUDGET,
      )
      .txInScript(this.scriptCbor)
      .txOut(this.scriptAddress, escrowAmount)
      .txOutInlineDatumValue(outputDatum, "JSON")
      .changeAddress(walletAddress)
      .txInCollateral(
        collateral.input.txHash,
        collateral.input.outputIndex,
        collateral.output.amount,
        collateral.output.address,
      )
      .selectUtxosFrom(utxos)
      .complete();
    return this.mesh.txHex;
  };

  completeEscrow = async (escrowUtxo: UTxO): Promise<string> => {
    const { utxos, walletAddress, collateral } =
      await this.getWalletInfoForTx();

    const inputDatum = deserializeDatum<ActiveEscrowDatum>(
      escrowUtxo.output.plutusData!,
    );
    const [
      initiatorAddressObj,
      initiatorAmount,
      recipientAddressObj,
      recipientAmount,
    ] = inputDatum.fields;
    const initiatorAddress = serializeAddressObj(
      initiatorAddressObj,
      this.networkId,
    );
    const recipientAddress = serializeAddressObj(
      recipientAddressObj,
      this.networkId,
    );
    const initiatorToReceive = MeshValue.fromValue(recipientAmount).toAssets();
    const recipientToReceive = MeshValue.fromValue(initiatorAmount).toAssets();

    await this.mesh
      .spendingPlutusScript(this.languageVersion)
      .txIn(
        escrowUtxo.input.txHash,
        escrowUtxo.input.outputIndex,
        escrowUtxo.output.amount,
        this.scriptAddress,
      )
      .spendingReferenceTxInInlineDatumPresent()
      .spendingReferenceTxInRedeemerValue(mConStr2([]))
      .txInScript(this.scriptCbor)
      .txOut(initiatorAddress, initiatorToReceive)
      .txOut(recipientAddress, recipientToReceive)
      .requiredSignerHash(deserializeAddress(recipientAddress).pubKeyHash)
      .requiredSignerHash(deserializeAddress(initiatorAddress).pubKeyHash)
      .changeAddress(walletAddress)
      .txInCollateral(
        collateral.input.txHash,
        collateral.input.outputIndex,
        collateral.output.amount,
        collateral.output.address,
      )
      .selectUtxosFrom(utxos)
      .complete();
    return this.mesh.txHex;
  };

  getUtxoByTxHash = async (txHash: string): Promise<UTxO | undefined> => {
    return await this._getUtxoByTxHash(txHash, this.scriptCbor);
  };
}
