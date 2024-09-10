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
  serializePlutusScript,
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
  constructor(inputs: MeshTxInitiatorInput) {
    super(inputs);
  }

  getScriptCbor = () => {
    let scriptCbor;
    switch (this.version) {
      case 2:
        scriptCbor = applyParamsToScript(
          blueprintV2.validators[0]!.compiledCode,
          [],
        );
        break;
      default:
        scriptCbor = applyParamsToScript(
          blueprintV1.validators[0]!.compiledCode,
          [],
        );
        break;
    }
    return scriptCbor;
  };

  depositFund = async (
    amount: Asset[],
    lockUntilTimeStampMs: number,
    beneficiary: string,
  ): Promise<string> => {
    const { utxos, walletAddress } = await this.getWalletInfoForTx();

    const scriptAddr = serializePlutusScript(
      { code: this.getScriptCbor(), version: this.languageVersion },
      undefined,
      this.networkId,
    ).address;
    const { pubKeyHash: ownerPubKeyHash } = deserializeAddress(walletAddress);
    const { pubKeyHash: beneficiaryPubKeyHash } =
      deserializeAddress(beneficiary);

    await this.mesh
      .txOut(scriptAddr, amount)
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

    const scriptCbor = this.getScriptCbor();
    const scriptAddr = serializePlutusScript(
      { code: scriptCbor, version: this.languageVersion },
      undefined,
      this.networkId,
    ).address;
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
        scriptAddr,
      )
      .spendingReferenceTxInInlineDatumPresent()
      .spendingReferenceTxInRedeemerValue("")
      .txInScript(scriptCbor)
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
    return await this._getUtxoByTxHash(txHash, this.getScriptCbor());
  };
}
