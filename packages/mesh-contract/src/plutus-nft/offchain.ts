import { Data, mConStr0, mOutputReference, stringToHex } from "@meshsdk/common";
import {
  deserializeAddress,
  resolveScriptHash,
  serializePlutusScript,
  UTxO,
} from "@meshsdk/core";
import {
  applyCborEncoding,
  applyParamsToScript,
  parseDatumCbor,
} from "@meshsdk/core-csl";

import { MeshTxInitiator, MeshTxInitiatorInput } from "../common";
import blueprint from "./aiken-workspace/plutus.json";
import { OracleDatum } from "./type";

export class MeshPlutusNFT extends MeshTxInitiator {
  collectionName: string;
  paramUtxo: UTxO["input"] = { outputIndex: 0, txHash: "" };
  oracleAddress: string;

  getOracleCbor = () => {
    return applyCborEncoding(blueprint.validators[0]!.compiledCode);
  };

  getOracleNFTCbor = () => {
    return applyParamsToScript(blueprint.validators[2]!.compiledCode, [
      mOutputReference(this.paramUtxo.txHash, this.paramUtxo.outputIndex),
    ]);
  };

  getNFTCbor = () => {
    const oracleNftPolicyId = resolveScriptHash(this.getOracleNFTCbor(), "V3");
    return applyParamsToScript(blueprint.validators[5]!.compiledCode, [
      stringToHex(this.collectionName),
      oracleNftPolicyId,
    ]);
  };

  constructor(
    inputs: MeshTxInitiatorInput,
    collectionName: string,
    paramUtxo?: UTxO["input"],
  ) {
    super(inputs);
    this.collectionName = collectionName;
    if (paramUtxo) {
      this.paramUtxo = paramUtxo;
    }
    this.oracleAddress = serializePlutusScript(
      {
        code: applyCborEncoding(blueprint.validators[0]!.compiledCode),
        version: "V3",
      },
      inputs.stakeCredential,
      inputs.networkId,
    ).address;
  }

  // Setup
  setupOracle = async () => {
    const { utxos, collateral, walletAddress } =
      await this.getWalletInfoForTx();
    if (utxos?.length <= 0) {
      throw new Error("No UTxOs found");
    }
    const paramUtxo = utxos[0]!;
    const script = blueprint.validators[2]!.compiledCode;
    const param: Data = mOutputReference(
      paramUtxo.input.txHash,
      paramUtxo.input.outputIndex,
    );
    const paramScript = applyParamsToScript(script, [param]);
    const policyId = resolveScriptHash(paramScript, "V3");
    const tokenName = "";
    const pubKeyHash = deserializeAddress(walletAddress).pubKeyHash;

    const txHex = await this.mesh
      .txIn(
        paramUtxo.input.txHash,
        paramUtxo.input.outputIndex,
        paramUtxo.output.amount,
        paramUtxo.output.address,
      )
      .mintPlutusScriptV3()
      .mint("1", policyId, tokenName)
      .mintingScript(paramScript)
      .mintRedeemerValue(mConStr0([]))
      .txOut(this.oracleAddress, [{ unit: policyId, quantity: "1" }])
      .txOutInlineDatumValue(mConStr0([0, pubKeyHash]))
      .txInCollateral(
        collateral.input.txHash,
        collateral.input.outputIndex,
        collateral.output.amount,
        collateral.output.address,
      )
      .changeAddress(walletAddress)
      .complete();

    this.paramUtxo = paramUtxo.input;
    console.log("Param utxo", this.paramUtxo);

    return txHex;
  };

  // Mint
  mintPlutusNFT = async () => {
    const { utxos, collateral, walletAddress } =
      await this.getWalletInfoForTx();
    if (utxos?.length <= 0) {
      throw new Error("No UTxOs found");
    }
    const oracleNftPolicyId = resolveScriptHash(this.getOracleNFTCbor(), "V3");
    const oracleUtxo = (
      await this.getAddressUtxosWithToken(this.oracleAddress, oracleNftPolicyId)
    )[0]!;
    const oracleDatum: OracleDatum = parseDatumCbor(
      oracleUtxo!.output.plutusData!,
    );
    const existingCounter = oracleDatum.fields[0].int;

    const pubKeyHash = deserializeAddress(walletAddress).pubKeyHash;

    const policyId = resolveScriptHash(this.getNFTCbor(), "V3");
    const tokenName = stringToHex(
      `${this.collectionName} (${existingCounter})`,
    );

    const txHex = await this.mesh
      .spendingPlutusScriptV3()
      .txIn(
        oracleUtxo.input.txHash,
        oracleUtxo.input.outputIndex,
        oracleUtxo.output.amount,
        oracleUtxo.output.address,
      )
      .txInRedeemerValue(mConStr0([]))
      .txInScript(this.getOracleCbor())
      .txInInlineDatumPresent()
      .mintPlutusScriptV3()
      .mint("1", policyId, tokenName)
      .mintingScript(this.getNFTCbor())
      .mintRedeemerValue(mConStr0([]))
      .txOut(this.oracleAddress, [{ unit: oracleNftPolicyId, quantity: "1" }])
      .txOutInlineDatumValue(
        mConStr0([(existingCounter as number) + 1, pubKeyHash]),
      )
      .txInCollateral(
        collateral.input.txHash,
        collateral.input.outputIndex,
        collateral.output.amount,
        collateral.output.address,
      )
      .changeAddress(walletAddress)
      .complete();

    console.log("Param utxo", this.paramUtxo);
    return txHex;
  };

  getUtxoByTxHash = async (txHash: string): Promise<UTxO | undefined> => {
    return await this._getUtxoByTxHash(txHash);
  };
}
