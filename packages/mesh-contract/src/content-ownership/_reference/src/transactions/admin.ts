import { MeshTxBuilder, IFetcher } from "@meshsdk/core";
import {
  MeshTxInitiator,
  TxConstants,
  contentAddress,
  contentPolicyId,
  contentTokenRefTxHash,
  contentTokenRefTxId,
  getScriptCbor,
  opsKey,
  oracleAddress,
  oraclePolicyId,
  ownershipAddress,
  ownershipPolicyId,
  ownershipTokenRefTxHash,
  ownershipTokenRefTxId,
  stopKey,
} from "./common";
import { mConStr, mConStr1, stringToHex } from "@sidan-lab/sidan-csl";

export class AdminAction extends MeshTxInitiator {
  constructor(mesh: MeshTxBuilder, fetcher: IFetcher, constants: TxConstants) {
    super(mesh, fetcher, constants);
  }

  stopContentRegistry = async (txInHash: string, txInId: number, registryNumber: number) => {
    const registryTokenNameHex = stringToHex(`Registry (${registryNumber})`);
    const scriptUtxos = await this.fetcher.fetchAddressUTxOs(contentAddress, contentPolicyId + registryTokenNameHex);
    const oracleUtxo = await this.fetcher.fetchAddressUTxOs(oracleAddress, oraclePolicyId);
    const { txHash: oracleTxHash, outputIndex: oracleTxId } = oracleUtxo[0].input;
    const { txHash: validatorTxHash, outputIndex: validatorTxId } = scriptUtxos[0].input;
    const { input, output } = this.constants.collateralUTxO;

    await this.mesh
      .txIn(txInHash, txInId)
      .spendingPlutusScriptV2()
      .txIn(validatorTxHash, validatorTxId)
      .txInInlineDatumPresent()
      .txInRedeemerValue(mConStr(2, []))
      .txInScript(getScriptCbor("ContentRegistry"))
      .mintPlutusScriptV2()
      .mint(-1, contentPolicyId, registryTokenNameHex)
      .mintTxInReference(contentTokenRefTxHash, contentTokenRefTxId)
      .mintRedeemerValue(mConStr1([]))
      .readOnlyTxInReference(oracleTxHash, oracleTxId)
      .changeAddress(this.constants.walletAddress)
      .txInCollateral(input.txHash, input.outputIndex, output.amount, output.address)
      .requiredSignerHash(stopKey)
      .signingKey(this.constants.skey!)
      .complete();
    const txBody = this.mesh.completeSigning();
    return txBody;
  };

  stopOwnershipRegistry = async (txInHash: string, txInId: number, registryNumber: number) => {
    const registryTokenNameHex = stringToHex(`Registry (${registryNumber})`);
    const scriptUtxos = await this.fetcher.fetchAddressUTxOs(
      ownershipAddress,
      ownershipPolicyId + registryTokenNameHex
    );
    const oracleUtxo = await this.fetcher.fetchAddressUTxOs(oracleAddress, oraclePolicyId);
    const { txHash: oracleTxHash, outputIndex: oracleTxId } = oracleUtxo[0].input;
    const { txHash: validatorTxHash, outputIndex: validatorTxId } = scriptUtxos[0].input;
    const { input, output } = this.constants.collateralUTxO;

    await this.mesh
      .txIn(txInHash, txInId)
      .spendingPlutusScriptV2()
      .txIn(validatorTxHash, validatorTxId)
      .txInInlineDatumPresent()
      .txInRedeemerValue(mConStr(2, []))
      .txInScript(getScriptCbor("OwnershipRegistry"))
      .mintPlutusScriptV2()
      .mint(-1, ownershipPolicyId, registryTokenNameHex)
      .mintTxInReference(ownershipTokenRefTxHash, ownershipTokenRefTxId)
      .mintRedeemerValue(mConStr1([]))
      .readOnlyTxInReference(oracleTxHash, oracleTxId)
      .changeAddress(this.constants.walletAddress)
      .txInCollateral(input.txHash, input.outputIndex, output.amount, output.address)
      .requiredSignerHash(stopKey)
      .signingKey(this.constants.skey!)
      .complete();
    const txBody = this.mesh.completeSigning();
    return txBody;
  };

  stopOracle = async (txInHash: string, txInId: number) => {
    const oracleUtxo = await this.fetcher.fetchAddressUTxOs(oracleAddress, oraclePolicyId);
    const { txHash, outputIndex } = oracleUtxo[0].input;
    const { input, output } = this.constants.collateralUTxO;

    await this.mesh
      .txIn(txInHash, txInId)
      .spendingPlutusScriptV2()
      .txIn(txHash, outputIndex)
      .txInInlineDatumPresent()
      .txInRedeemerValue(mConStr(3, []))
      .txInScript(getScriptCbor("OracleValidator"))
      .mintPlutusScriptV2()
      .mint(-1, oraclePolicyId, "")
      .mintingScript(getScriptCbor("OracleNFT"))
      .mintRedeemerValue(mConStr1([]))
      .changeAddress(this.constants.walletAddress)
      .changeAddress(this.constants.walletAddress)
      .txInCollateral(input.txHash, input.outputIndex, output.amount, output.address)
      .requiredSignerHash(opsKey)
      .requiredSignerHash(stopKey)
      .signingKey(this.constants.skey!)
      .complete();
    const txBody = this.mesh.completeSigning();
    return txBody;
  };
}
