import {
  BuiltinByteString,
  ConStr0,
  Integer,
  mConStr0,
  SLOT_CONFIG_NETWORK,
  unixTimeToEnclosingSlot,
} from "@meshsdk/common";
import {
  Asset,
  deserializeAddress,
  deserializeDatum,
  UTxO,
} from "@meshsdk/core";
import { applyParamsToScript } from "@meshsdk/core-csl";

import { MeshTxInitiator, MeshTxInitiatorInput } from "../common";
import blueprintV1 from "./aiken-workspace-v1/plutus.json";
import blueprintV2 from "./aiken-workspace-v2/plutus.json";

export type VestingDatum = ConStr0<
  [Integer, BuiltinByteString, BuiltinByteString]
>;

export class MeshVestingContract extends MeshTxInitiator {
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

  depositFund = async (
    amount: Asset[],
    lockUntilTimeStampMs: number,
    beneficiary: string,
  ): Promise<string> => {
    const { utxos, walletAddress } = await this.getWalletInfoForTx();

    const { pubKeyHash: ownerPubKeyHash } = deserializeAddress(walletAddress);
    const { pubKeyHash: beneficiaryPubKeyHash } =
      deserializeAddress(beneficiary);

    await this.mesh
      .txOut(this.scriptAddress, amount)
      .txOutInlineDatumValue(
        mConStr0([
          lockUntilTimeStampMs,
          ownerPubKeyHash,
          beneficiaryPubKeyHash,
        ]),
      )
      .changeAddress(walletAddress)
      .selectUtxosFrom(utxos)
      .complete();
    return this.mesh.txHex;
  };

  withdrawFund = async (vestingUtxo: UTxO): Promise<string> => {
    const { utxos, walletAddress, collateral } =
      await this.getWalletInfoForTx();
    const { input: collateralInput, output: collateralOutput } = collateral;

    const { pubKeyHash } = deserializeAddress(walletAddress);

    const datum = deserializeDatum<VestingDatum>(
      vestingUtxo.output.plutusData!,
    );

    const invalidBefore =
      unixTimeToEnclosingSlot(
        Math.min(datum.fields[0].int as number, Date.now() - 15000),
        this.networkId === 0
          ? SLOT_CONFIG_NETWORK.preprod
          : SLOT_CONFIG_NETWORK.mainnet,
      ) + 1;

    await this.mesh
      .spendingPlutusScript(this.languageVersion)
      .txIn(
        vestingUtxo.input.txHash,
        vestingUtxo.input.outputIndex,
        vestingUtxo.output.amount,
        this.scriptAddress,
      )
      .spendingReferenceTxInInlineDatumPresent()
      .spendingReferenceTxInRedeemerValue("")
      .txInScript(this.scriptCbor)
      .txOut(walletAddress, [])
      .txInCollateral(
        collateralInput.txHash,
        collateralInput.outputIndex,
        collateralOutput.amount,
        collateralOutput.address,
      )
      .invalidBefore(invalidBefore)
      .requiredSignerHash(pubKeyHash)
      .changeAddress(walletAddress)
      .selectUtxosFrom(utxos)
      .complete();
    return this.mesh.txHex;
  };

  getUtxoByTxHash = async (txHash: string): Promise<UTxO | undefined> => {
    return await this._getUtxoByTxHash(txHash, this.scriptCbor);
  };
}
