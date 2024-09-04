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
import blueprint from "./aiken-workspace/plutus.json";

export const MeshVestingBlueprint = blueprint;

export type VestingDatum = ConStr0<
  [Integer, BuiltinByteString, BuiltinByteString]
>;

export class MeshVestingContract extends MeshTxInitiator {
  scriptCbor = applyParamsToScript(blueprint.validators[0]!.compiledCode, []);

  constructor(inputs: MeshTxInitiatorInput) {
    super(inputs);
  }

  depositFund = async (
    amount: Asset[],
    lockUntilTimeStampMs: number,
    beneficiary: string,
  ): Promise<string> => {
    const { utxos, walletAddress } = await this.getWalletInfoForTx();

    const scriptAddr = serializePlutusScript(
      { code: this.scriptCbor, version: "V2" },
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
    const scriptAddr = serializePlutusScript(
      { code: this.scriptCbor, version: "V2" },
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
      .spendingPlutusScriptV2()
      .txIn(
        vestingUtxo.input.txHash,
        vestingUtxo.input.outputIndex,
        vestingUtxo.output.amount,
        scriptAddr,
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
