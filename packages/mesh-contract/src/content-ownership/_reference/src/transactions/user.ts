import { MeshTxBuilder, IFetcher, UTxO, Data } from "@meshsdk/core";
import {
  InputUTxO,
  MeshTxInitiator,
  TxConstants,
  contentAddress,
  contentPolicyId,
  contentRegistryRefTxHash,
  contentRegistryRefTxId,
  getScriptHash,
  oracleAddress,
  oraclePolicyId,
  ownershipAddress,
  ownershipPolicyId,
  ownershipRegistryRefTxHash,
  ownershipRegistryRefTxId,
} from "./common";
import { mConStr, parseInlineDatum, stringToHex } from "@sidan-lab/sidan-csl";
import { ContentRegistryDatum, OwnershipRegistryDatum } from "./type";

export type UpdateContent = {
  feeUtxo: UTxO;
  ownerTokenUtxo: UTxO;
  walletAddress: string;
  registryNumber: number;
  newContentHashHex: string;
  contentNumber: number;
};

export type TransferContent = {
  feeUtxo: UTxO;
  ownerTokenUtxo: UTxO;
  walletAddress: string;
  registryNumber: number;
  newOwnerAssetHex: string;
  contentNumber: number;
};

export class UserAction extends MeshTxInitiator {
  constructor(mesh: MeshTxBuilder, fetcher: IFetcher, constants: TxConstants) {
    super(mesh, fetcher, constants);
  }

  // TODO: Input user's address
  createContent = async (feeUtxo: UTxO, ownerAssetHex: string, contentHashHex: string, registryNumber = 0) => {
    const registryName = stringToHex(`Registry (${registryNumber})`);
    const oracleUtxo: UTxO[] = await this.fetcher.fetchAddressUTxOs(oracleAddress, oraclePolicyId);
    const contentUtxo: UTxO[] = await this.fetcher.fetchAddressUTxOs(contentAddress, contentPolicyId + registryName);
    const ownershipUtxo: UTxO[] = await this.fetcher.fetchAddressUTxOs(
      ownershipAddress,
      ownershipPolicyId + registryName
    );
    const { txHash: oracleTxHash, outputIndex: oracleTxId } = oracleUtxo[0].input;
    const {
      input: { txHash: contentTxHash, outputIndex: contentTxId },
      output: { address: _contentAddress, amount: contentAmount },
    } = contentUtxo[0];
    const { txHash: ownershipTxHash, outputIndex: ownershipTxId } = ownershipUtxo[0].input;
    const ownerAssetClass: [string, string] = [ownerAssetHex.slice(0, 56), ownerAssetHex.slice(56)];
    const newContentRegistry = this.insertContentRegistry(contentUtxo[0].output.plutusData!, contentHashHex);
    const newOwnershipRegistry = this.insertOwnershipRegistry(ownershipUtxo[0].output.plutusData!, ownerAssetClass);
    const { input: collateralInput, output: collateralOutput } = this.constants.collateralUTxO;

    await this.mesh
      .txIn(feeUtxo.input.txHash, feeUtxo.input.outputIndex, feeUtxo.output.amount, feeUtxo.output.address)
      .spendingPlutusScriptV2()
      .txIn(contentTxHash, contentTxId, contentAmount, contentAddress)
      .txInInlineDatumPresent()
      .txInRedeemerValue(mConStr(0, [contentHashHex, ownerAssetClass]))
      .spendingTxInReference(contentRegistryRefTxHash, contentRegistryRefTxId, getScriptHash("ContentRegistry"))
      .txOut(contentAddress, [{ unit: contentPolicyId + registryName, quantity: "1" }])
      .txOutInlineDatumValue(newContentRegistry)
      .spendingPlutusScriptV2()
      .txIn(ownershipTxHash, ownershipTxId)
      .txInInlineDatumPresent()
      .txInRedeemerValue(mConStr(0, []))
      .spendingTxInReference(ownershipRegistryRefTxHash, ownershipRegistryRefTxId, getScriptHash("OwnershipRegistry"))
      .txOut(ownershipAddress, [{ unit: ownershipPolicyId + registryName, quantity: "1" }])
      .txOutInlineDatumValue(newOwnershipRegistry)
      .readOnlyTxInReference(oracleTxHash, oracleTxId)
      .changeAddress(this.constants.walletAddress)
      .txInCollateral(
        collateralInput.txHash,
        collateralInput.outputIndex,
        collateralOutput.amount,
        collateralOutput.address
      )
      .complete();
    const txHex = this.mesh.completeSigning();
    return txHex;
  };

  updateContent = async ({
    feeUtxo,
    ownerTokenUtxo,
    walletAddress,
    registryNumber,
    newContentHashHex,
    contentNumber,
  }: UpdateContent) => {
    const registryTokenNameHex = stringToHex(`Registry (${registryNumber})`);
    const [oracle, content, ownership] = await this.getScriptUtxos(registryNumber);
    const newContentRegistry = this.updateContentRegistry(content.output.plutusData!, contentNumber, newContentHashHex);
    const { input: collateralInput, output: collateralOutput } = this.constants.collateralUTxO;

    await this.mesh
      .txIn(feeUtxo.input.txHash, feeUtxo.input.outputIndex, feeUtxo.output.amount, feeUtxo.output.address)
      .txIn(
        ownerTokenUtxo.input.txHash,
        ownerTokenUtxo.input.outputIndex,
        ownerTokenUtxo.output.amount,
        ownerTokenUtxo.output.address
      )
      .spendingPlutusScriptV2()
      .txIn(content.input.txHash, content.input.outputIndex, content.output.amount, content.output.address)
      .txInInlineDatumPresent()
      .txInRedeemerValue(mConStr(1, [newContentHashHex, contentNumber]))
      .spendingTxInReference(contentRegistryRefTxHash, contentRegistryRefTxId)
      .txOut(contentAddress, [{ unit: contentPolicyId + registryTokenNameHex, quantity: "1" }])
      .txOutInlineDatumValue(newContentRegistry)
      .readOnlyTxInReference(oracle.input.txHash, oracle.input.outputIndex)
      .readOnlyTxInReference(ownership.input.txHash, ownership.input.outputIndex)
      .changeAddress(walletAddress)
      .txInCollateral(
        collateralInput.txHash,
        collateralInput.outputIndex,
        collateralOutput.amount,
        collateralOutput.address
      )
      .complete();
    const txBody = this.mesh.completeSigning();
    return txBody;
  };

  transferContent = async ({
    feeUtxo,
    ownerTokenUtxo,
    walletAddress,
    registryNumber,
    newOwnerAssetHex,
    contentNumber,
  }: TransferContent) => {
    const registryTokenNameHex = stringToHex(`Registry (${registryNumber})`);
    const [oracle, ownership] = await this.getScriptUtxos(registryNumber, ["oracle", "ownership"]);
    const newOwnerAssetClass: [string, string] = [newOwnerAssetHex.slice(0, 56), newOwnerAssetHex.slice(56)];
    const newOwnershipRegistry = this.updateOwnershipRegistry(
      ownership.output.plutusData!,
      contentNumber,
      newOwnerAssetClass
    );
    const { input: collateralInput, output: collateralOutput } = this.constants.collateralUTxO;

    await this.mesh
      .txIn(feeUtxo.input.txHash, feeUtxo.input.outputIndex, feeUtxo.output.amount, feeUtxo.output.address)
      .txIn(
        ownerTokenUtxo.input.txHash,
        ownerTokenUtxo.input.outputIndex,
        ownerTokenUtxo.output.amount,
        ownerTokenUtxo.output.address
      )
      .spendingPlutusScriptV2()
      .txIn(ownership.input.txHash, ownership.input.outputIndex, ownership.output.amount, ownership.output.address)
      .txInInlineDatumPresent()
      .txInRedeemerValue(mConStr(1, [newOwnerAssetClass, contentNumber]))
      .spendingTxInReference(ownershipRegistryRefTxHash, ownershipRegistryRefTxId)
      .txOut(ownershipAddress, [{ unit: ownershipPolicyId + registryTokenNameHex, quantity: "1" }])
      .txOutInlineDatumValue(newOwnershipRegistry)
      .readOnlyTxInReference(oracle.input.txHash, oracle.input.outputIndex)
      .changeAddress(walletAddress)
      .txInCollateral(
        collateralInput.txHash,
        collateralInput.outputIndex,
        collateralOutput.amount,
        collateralOutput.address
      )
      .complete();
    const txBody = this.mesh.completeSigning();
    return txBody;
  };

  private insertContentRegistry = (plutusData: string, newContentHash: string): Data => {
    const contentRegistry = parseInlineDatum<any, ContentRegistryDatum>({
      inline_datum: plutusData,
    }).fields[1].list.map((plutusBytes) => plutusBytes.bytes);
    const newContentRegistry = this.getContentDatum([...contentRegistry, newContentHash]);
    return newContentRegistry;
  };

  private insertOwnershipRegistry = (plutusData: string, ownerAssetClass: [string, string]): Data => {
    const ownershipRegistry = parseInlineDatum<any, OwnershipRegistryDatum>({
      inline_datum: plutusData,
    }).fields[1].list.map((plutusBytesArray): [string, string] => [
      plutusBytesArray.list[0].bytes,
      plutusBytesArray.list[1].bytes,
    ]);
    const newContentRegistry = this.getOwnershipDatum([...ownershipRegistry, ownerAssetClass]);
    return newContentRegistry;
  };

  private updateContentRegistry = (plutusData: string, contentNumber: number, newContentHash: string): Data => {
    const contentRegistry = parseInlineDatum<any, ContentRegistryDatum>({
      inline_datum: plutusData,
    }).fields[1].list.map((plutusBytes) => plutusBytes.bytes);
    contentRegistry[contentNumber] = newContentHash;
    const newContentRegistry = this.getContentDatum(contentRegistry);
    return newContentRegistry;
  };

  private updateOwnershipRegistry = (
    plutusData: string,
    contentNumber: number,
    ownerAssetClass: [string, string]
  ): Data => {
    const ownershipRegistry = parseInlineDatum<any, OwnershipRegistryDatum>({
      inline_datum: plutusData,
    }).fields[1].list.map((plutusBytesArray): [string, string] => [
      plutusBytesArray.list[0].bytes,
      plutusBytesArray.list[1].bytes,
    ]);
    ownershipRegistry[contentNumber] = ownerAssetClass;
    const newContentRegistry = this.getOwnershipDatum(ownershipRegistry);
    return newContentRegistry;
  };
}
