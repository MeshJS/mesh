import { Data, IFetcher, MeshTxBuilder } from "@meshsdk/core";
import { applyParamsToScript, blueprint } from "../aiken";
import { getV2ScriptHash, mConStr0, mConStr1, stringToHex } from "@sidan-lab/sidan-csl";
import {
  TxConstants,
  ScriptIndex,
  getScriptCbor,
  refScriptsAddress,
  oraclePolicyId,
  getScriptHash,
  oracleValidatorRefTxHash,
  oracleValidatorRefTxId,
  contentTokenRefTxHash,
  contentTokenRefTxId,
  ownershipTokenRefTxHash,
  ownershipTokenRefTxId,
  MeshTxInitiator,
  oracleAddress,
  contentAddress,
  contentPolicyId,
  ownershipAddress,
  ownershipPolicyId,
} from "./common";

export class ScriptsSetup extends MeshTxInitiator {
  constructor(mesh: MeshTxBuilder, fetcher: IFetcher, setupConstants: TxConstants) {
    super(mesh, fetcher, setupConstants);
  }

  mintOneTimeMintingPolicy = async (paramTxHash: string, paramTxId: number) => {
    const script = blueprint.validators[2].compiledCode;
    const param: Data = {
      alternative: 0,
      fields: [{ alternative: 0, fields: [paramTxHash] }, paramTxId],
    };
    const paramScript = applyParamsToScript(script, { type: "Mesh", params: [param] });
    const policyId = getV2ScriptHash(paramScript);
    const tokenName = "";
    const { input, output } = this.constants.collateralUTxO;

    await this.mesh
      .txIn(paramTxHash, paramTxId)
      .txOut(this.constants.walletAddress, [{ unit: policyId + tokenName, quantity: "1" }])
      .mintPlutusScriptV2()
      .mint(1, policyId, tokenName)
      .mintingScript(paramScript)
      .mintRedeemerValue(mConStr0([]))
      .txInCollateral(input.txHash, input.outputIndex, output.amount, output.address)
      .changeAddress(this.constants.walletAddress)
      .signingKey(this.constants.skey!)
      .complete();
    const txHash = await this.signSubmitReset();
    return txHash;
  };

  sendRefScriptOnchain = async (txInHash: string, txInId: number, scriptIndex: ScriptIndex) => {
    const scriptCbor = getScriptCbor(scriptIndex);
    await this.mesh
      .txIn(txInHash, txInId)
      .txOut(refScriptsAddress, [])
      .txOutReferenceScript(scriptCbor)
      .changeAddress(this.constants.walletAddress)
      .signingKey(this.constants.skey!)
      .complete();
    const txHash = await this.signSubmitReset();
    return txHash;
  };

  setupOracleUtxo = async (txInHash: string, txInId: number, nftTxHash: string, nftTxId: number) => {
    const datumValue = this.getOracleDatum(0, 0);
    await this.mesh
      .txIn(txInHash, txInId)
      .txIn(nftTxHash, nftTxId)
      .txOut(oracleAddress, [{ unit: oraclePolicyId + "", quantity: "1" }])
      .txOutInlineDatumValue(datumValue)
      .changeAddress(this.constants.walletAddress)
      .signingKey(this.constants.skey!)
      .complete();

    const txHash = await this.signSubmitReset();
    return txHash;
  };

  createContentRegistry = async (txInHash: string, txInId: number) => {
    const scriptUtxo = await this.fetcher.fetchAddressUTxOs(oracleAddress, oraclePolicyId);
    const currentOracleDatum = await this.getCurrentOracleDatum(scriptUtxo);
    const contentNumber = currentOracleDatum.fields[4].int;
    const ownershipNumber = currentOracleDatum.fields[7].int;
    const contentTokenName = stringToHex(`Registry (${contentNumber})`);
    const { txHash: oracleTxHash, outputIndex: oracleTxId } = scriptUtxo[0].input;
    const oracleDatumValue = this.getOracleDatum(contentNumber + 1, ownershipNumber);
    const { input, output } = this.constants.collateralUTxO;
    console.log("Oracle Datum", oracleDatumValue);

    await this.mesh
      .txIn(txInHash, txInId)
      .spendingPlutusScriptV2()
      .txIn(oracleTxHash, oracleTxId)
      .txInInlineDatumPresent()
      .txInRedeemerValue(mConStr0([]))
      .spendingTxInReference(oracleValidatorRefTxHash, oracleValidatorRefTxId, getScriptHash("OracleValidator"))
      .txOut(oracleAddress, [{ unit: oraclePolicyId + "", quantity: "1" }])
      .txOutInlineDatumValue(oracleDatumValue)
      .txOut(contentAddress, [{ unit: contentPolicyId + contentTokenName, quantity: "1" }])
      .txOutInlineDatumValue(mConStr0([0, []]))
      .mintPlutusScriptV2()
      .mint(1, contentPolicyId, contentTokenName)
      .mintTxInReference(contentTokenRefTxHash, contentTokenRefTxId)
      .mintRedeemerValue(mConStr0([]))
      .txInCollateral(input.txHash, input.outputIndex, output.amount, output.address)
      .changeAddress(this.constants.walletAddress)
      .signingKey(this.constants.skey!)
      .complete();

    const txHash = await this.signSubmitReset();
    return txHash;
  };

  createOwnershipRegistry = async (txInHash: string, txInId: number) => {
    const scriptUtxo = await this.fetcher.fetchAddressUTxOs(oracleAddress, oraclePolicyId);
    const currentOracleDatum = await this.getCurrentOracleDatum(scriptUtxo);
    const contentNumber = currentOracleDatum.fields[4].int;
    const ownershipNumber = currentOracleDatum.fields[7].int;
    const ownershipTokenName = stringToHex(`Registry (${ownershipNumber})`);
    const { txHash: oracleTxHash, outputIndex: oracleTxId } = scriptUtxo[0].input;
    const oracleDatumValue = this.getOracleDatum(contentNumber, ownershipNumber + 1);
    const { input, output } = this.constants.collateralUTxO;
    console.log("Oracle Datum", oracleDatumValue);

    await this.mesh
      .txIn(txInHash, txInId)
      .spendingPlutusScriptV2()
      .txIn(oracleTxHash, oracleTxId)
      .txInInlineDatumPresent()
      .txInRedeemerValue(mConStr1([]))
      .spendingTxInReference(oracleValidatorRefTxHash, oracleValidatorRefTxId, getScriptHash("OracleValidator"))
      .txOut(oracleAddress, [{ unit: oraclePolicyId + "", quantity: "1" }])
      .txOutInlineDatumValue(oracleDatumValue)
      .txOut(ownershipAddress, [{ unit: ownershipPolicyId + ownershipTokenName, quantity: "1" }])
      .txOutInlineDatumValue(mConStr0([0, []]))
      .mintPlutusScriptV2()
      .mint(1, ownershipPolicyId, ownershipTokenName)
      .mintTxInReference(ownershipTokenRefTxHash, ownershipTokenRefTxId)
      .mintRedeemerValue(mConStr0([]))
      .txInCollateral(input.txHash, input.outputIndex, output.amount, output.address)
      .changeAddress(this.constants.walletAddress)
      .signingKey(this.constants.skey!)
      .complete();

    const txHash = await this.signSubmitReset();
    return txHash;
  };
}
