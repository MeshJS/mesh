import {
  Data,
  deserializeAddress,
  mConStr,
  mConStr0,
  mConStr1,
  mOutputReference,
  mScriptAddress,
  resolveScriptHash,
  stringToHex,
  UTxO,
} from "@meshsdk/core";
import { applyParamsToScript, parseInlineDatum } from "@meshsdk/core-csl";

import { MeshTxInitiator, MeshTxInitiatorInput } from "../../common";
import { blueprint, getScriptCbor, getScriptInfo, ScriptIndex } from "./common";
import {
  ContentRegistryDatum,
  OracleDatum,
  OwnershipRegistryDatum,
  TransferContent,
  UpdateContent,
} from "./type";

export class MeshContentOwnershipContract extends MeshTxInitiator {
  paramUtxo = {
    txHash: "0000000000000000000000000000000000000000000000000000000000000000",
    outputIndex: 0,
  };
  scriptInfo = getScriptInfo({
    outputIndex: 0,
    txHash: "0000000000000000000000000000000000000000000000000000000000000000",
  });
  refScriptUtxos = {
    contentRefToken: {
      txHash:
        "0000000000000000000000000000000000000000000000000000000000000000",
      outputIndex: 0,
    },
    ownershipRefToken: {
      txHash:
        "0000000000000000000000000000000000000000000000000000000000000000",
      outputIndex: 0,
    },
    contentRegistry: {
      txHash:
        "0000000000000000000000000000000000000000000000000000000000000000",
      outputIndex: 0,
    },
    ownershipRegistry: {
      txHash:
        "0000000000000000000000000000000000000000000000000000000000000000",
      outputIndex: 0,
    },
  };
  refScriptsAddress: string;
  operationAddress: string;
  opsKey: string;
  stopKey: string;

  constructor(
    inputs: MeshTxInitiatorInput,
    contract: {
      refScriptsAddress: string;
      operationAddress: string;
      paramUtxo?: UTxO["input"];
      refScriptUtxos?: {
        contentRefToken: UTxO["input"];
        ownershipRefToken: UTxO["input"];
        contentRegistry: UTxO["input"];
        ownershipRegistry: UTxO["input"];
      };
    },
  ) {
    super(inputs);

    this.paramUtxo = contract.paramUtxo || this.paramUtxo;
    this.refScriptUtxos = contract.refScriptUtxos || this.refScriptUtxos;

    this.scriptInfo = getScriptInfo(
      this.paramUtxo,
      inputs.stakeCredential,
      inputs.networkId,
    );

    this.refScriptsAddress = contract.refScriptsAddress;
    this.operationAddress = contract.operationAddress;

    const serializedOpsPlutusAddr = deserializeAddress(this.operationAddress);
    const serializedStopPlutusAddr = deserializeAddress(this.refScriptsAddress);
    this.opsKey = serializedOpsPlutusAddr.pubKeyHash;
    this.stopKey = serializedStopPlutusAddr.pubKeyHash;
  }

  // Setup
  mintOneTimeMintingPolicy = async () => {
    const { utxos, collateral, walletAddress } =
      await this.getWalletInfoForTx();
    if (utxos?.length <= 0) {
      throw new Error("No UTxOs found");
    }
    const paramUtxo = utxos[0]!;
    const script = blueprint.validators[4]!.compiledCode;
    const param: Data = mOutputReference(
      paramUtxo.input.txHash,
      paramUtxo.input.outputIndex,
    );
    const paramScript = applyParamsToScript(script, [param]);
    const policyId = resolveScriptHash(paramScript, "V3");
    const tokenName = "";

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
      .txInCollateral(
        collateral.input.txHash,
        collateral.input.outputIndex,
        collateral.output.amount,
        collateral.output.address,
      )
      .changeAddress(walletAddress)
      .selectUtxosFrom(utxos.slice(1))
      .complete();

    this.scriptInfo = getScriptInfo(
      paramUtxo.input,
      this.stakeCredential,
      this.networkId,
    );
    return { tx: txHex, paramUtxo: paramUtxo.input };
  };

  sendRefScriptOnchain = async (scriptIndex: ScriptIndex) => {
    const { utxos, walletAddress } = await this.getWalletInfoForTx();
    const txHex = await this.mesh
      .txOut(this.refScriptsAddress, [])
      .txOutReferenceScript(getScriptCbor(this.paramUtxo, scriptIndex))
      .changeAddress(walletAddress)
      .selectUtxosFrom(utxos)
      .complete();
    return txHex;
  };

  setupOracleUtxo = async () => {
    const { utxos, walletAddress } = await this.getWalletInfoForTx();
    const datumValue = this.getOracleDatum(0, 0);
    const txHex = await this.mesh
      .txOut(this.scriptInfo.oracleValidator.address, [
        { unit: this.scriptInfo.oracleNFT.hash + "", quantity: "1" },
      ])
      .txOutInlineDatumValue(datumValue)
      .changeAddress(walletAddress)
      .selectUtxosFrom(utxos)
      .complete();

    return txHex;
  };

  // WIP. need to chain tx, and also need to manage the UTXOs not consumed
  handleSetup = async () => {
    const { tx: txHexMintOneTimeMintingPolicy, paramUtxo } =
      await this.mintOneTimeMintingPolicy();

    this.paramUtxo = paramUtxo;
    this.scriptInfo = getScriptInfo(
      paramUtxo,
      this.stakeCredential,
      this.networkId,
    );

    const txHexSetupOracleUtxo = await this.setupOracleUtxo();

    return {
      txHexMintOneTimeMintingPolicy,
      txHexSetupOracleUtxo,
      paramUtxo,
    };
  };

  createContentRegistry = async () => {
    const { utxos, collateral, walletAddress } =
      await this.getWalletInfoForTx();
    const scriptUtxo = await this.fetcher!.fetchAddressUTxOs(
      this.scriptInfo.oracleValidator.address,
      this.scriptInfo.oracleNFT.hash,
    );
    const currentOracleDatum = await this.getCurrentOracleDatum(scriptUtxo);
    const contentNumber = currentOracleDatum.fields[4].int as number;
    const ownershipNumber = currentOracleDatum.fields[7].int as number;
    const contentTokenName = stringToHex(`Registry (${contentNumber})`);
    const { txHash: oracleTxHash, outputIndex: oracleTxId } =
      scriptUtxo[0]!.input;
    const oracleDatumValue = this.getOracleDatum(
      contentNumber + 1,
      ownershipNumber,
    );
    console.log("Oracle Datum", oracleDatumValue);

    const txHex = await this.mesh
      .spendingPlutusScriptV3()
      .txIn(oracleTxHash, oracleTxId)
      .txInInlineDatumPresent()
      .txInRedeemerValue(mConStr0([]))
      .txInScript(this.scriptInfo.oracleValidator.cbor)
      .txOut(this.scriptInfo.oracleValidator.address, [
        { unit: this.scriptInfo.oracleNFT.hash + "", quantity: "1" },
      ])
      .txOutInlineDatumValue(oracleDatumValue)
      .txOut(this.scriptInfo.contentRegistry.address, [
        {
          unit: this.scriptInfo.contentRefToken.hash + contentTokenName,
          quantity: "1",
        },
      ])
      .txOutInlineDatumValue(mConStr0([0, []]))
      .mintPlutusScriptV3()
      .mint("1", this.scriptInfo.contentRefToken.hash, contentTokenName)
      .mintTxInReference(
        this.refScriptUtxos.contentRefToken.txHash,
        this.refScriptUtxos.contentRefToken.outputIndex,
        (this.scriptInfo.contentRefToken.cbor.length / 2).toString(),
        this.scriptInfo.contentRefToken.hash,
      )
      .mintRedeemerValue(mConStr0([]))
      .txInCollateral(
        collateral.input.txHash,
        collateral.input.outputIndex,
        collateral.output.amount,
        collateral.output.address,
      )
      .changeAddress(walletAddress)
      .selectUtxosFrom(utxos)
      .complete();

    return txHex;
  };

  createOwnershipRegistry = async () => {
    const { utxos, collateral, walletAddress } =
      await this.getWalletInfoForTx();
    const scriptUtxo = await this.fetcher!.fetchAddressUTxOs(
      this.scriptInfo.oracleValidator.address,
      this.scriptInfo.oracleNFT.hash,
    );
    const currentOracleDatum = await this.getCurrentOracleDatum(scriptUtxo);
    const contentNumber = currentOracleDatum.fields[4].int as number;
    const ownershipNumber = currentOracleDatum.fields[7].int as number;
    const ownershipTokenName = stringToHex(`Registry (${ownershipNumber})`);
    const { txHash: oracleTxHash, outputIndex: oracleTxId } =
      scriptUtxo[0]!.input;
    const oracleDatumValue = this.getOracleDatum(
      contentNumber,
      ownershipNumber + 1,
    );
    console.log("Oracle Datum", oracleDatumValue);

    const txHex = await this.mesh
      .spendingPlutusScriptV3()
      .txIn(oracleTxHash, oracleTxId)
      .txInInlineDatumPresent()
      .txInRedeemerValue(mConStr1([]))
      .txInScript(this.scriptInfo.oracleValidator.cbor)
      .txOut(this.scriptInfo.oracleValidator.address, [
        { unit: this.scriptInfo.oracleNFT.hash + "", quantity: "1" },
      ])
      .txOutInlineDatumValue(oracleDatumValue)
      .txOut(this.scriptInfo.ownershipRegistry.address, [
        {
          unit: this.scriptInfo.ownershipRefToken.hash + ownershipTokenName,
          quantity: "1",
        },
      ])
      .txOutInlineDatumValue(mConStr0([0, []]))
      .mintPlutusScriptV3()
      .mint("1", this.scriptInfo.ownershipRefToken.hash, ownershipTokenName)
      .mintTxInReference(
        this.refScriptUtxos.ownershipRefToken.txHash,
        this.refScriptUtxos.ownershipRefToken.outputIndex,
        (this.scriptInfo.ownershipRefToken.cbor.length / 2).toString(),
        this.scriptInfo.ownershipRefToken.hash,
      )
      .mintRedeemerValue(mConStr0([]))
      .txInCollateral(
        collateral.input.txHash,
        collateral.input.outputIndex,
        collateral.output.amount,
        collateral.output.address,
      )
      .changeAddress(walletAddress)
      .selectUtxosFrom(utxos)
      .complete();

    return txHex;
  };

  // User

  createContent = async (
    ownerAssetHex: string,
    contentHashHex: string,
    registryNumber = 0,
  ) => {
    const { utxos, collateral, walletAddress } =
      await this.getWalletInfoForTx();
    const registryName = stringToHex(`Registry (${registryNumber})`);
    const oracleUtxo: UTxO[] = await this.fetcher!.fetchAddressUTxOs(
      this.scriptInfo.oracleValidator.address,
      this.scriptInfo.oracleNFT.hash,
    );
    const contentUtxo: UTxO[] = await this.fetcher!.fetchAddressUTxOs(
      this.scriptInfo.contentRegistry.address,
      this.scriptInfo.contentRefToken.hash + registryName,
    );
    const ownershipUtxo: UTxO[] = await this.fetcher!.fetchAddressUTxOs(
      this.scriptInfo.ownershipRegistry.address,
      this.scriptInfo.ownershipRefToken.hash + registryName,
    );
    const { txHash: oracleTxHash, outputIndex: oracleTxId } =
      oracleUtxo[0]!.input;

    const {
      input: { txHash: contentTxHash, outputIndex: contentTxId },
      output: { address: _contentAddress, amount: contentAmount },
    } = contentUtxo[0]!;
    const { txHash: ownershipTxHash, outputIndex: ownershipTxId } =
      ownershipUtxo[0]!.input;
    const ownerAssetClass: [string, string] = [
      ownerAssetHex.slice(0, 56),
      ownerAssetHex.slice(56),
    ];
    const newContentRegistry = this.insertContentRegistry(
      contentUtxo[0]!.output.plutusData!,
      contentHashHex,
    );
    const newOwnershipRegistry = this.insertOwnershipRegistry(
      ownershipUtxo[0]!.output.plutusData!,
      ownerAssetClass,
    );

    const txHex = await this.mesh
      .spendingPlutusScriptV3()
      .txIn(
        contentTxHash,
        contentTxId,
        contentAmount,
        this.scriptInfo.contentRegistry.address,
      )
      .txInInlineDatumPresent()
      .txInRedeemerValue(mConStr(0, [contentHashHex, ownerAssetClass]))
      .spendingTxInReference(
        this.refScriptUtxos.contentRegistry.txHash,
        this.refScriptUtxos.contentRegistry.outputIndex,
        (this.scriptInfo.contentRegistry.cbor.length / 2).toString(),
        this.scriptInfo.contentRegistry.hash,
      )
      .txOut(this.scriptInfo.contentRegistry.address, [
        {
          unit: this.scriptInfo.contentRefToken.hash + registryName,
          quantity: "1",
        },
      ])
      .txOutInlineDatumValue(newContentRegistry)
      .spendingPlutusScriptV3()
      .txIn(ownershipTxHash, ownershipTxId)
      .txInInlineDatumPresent()
      .txInRedeemerValue(mConStr(0, []))
      .spendingTxInReference(
        this.refScriptUtxos.ownershipRegistry.txHash,
        this.refScriptUtxos.ownershipRegistry.outputIndex,
        (this.scriptInfo.ownershipRegistry.cbor.length / 2).toString(),
        this.scriptInfo.ownershipRegistry.hash,
      )
      .txOut(this.scriptInfo.ownershipRegistry.address, [
        {
          unit: this.scriptInfo.ownershipRefToken.hash + registryName,
          quantity: "1",
        },
      ])
      .txOutInlineDatumValue(newOwnershipRegistry)
      .readOnlyTxInReference(oracleTxHash, oracleTxId)
      .changeAddress(walletAddress)
      .txInCollateral(
        collateral.input.txHash,
        collateral.input.outputIndex,
        collateral.output.amount,
        collateral.output.address,
      )
      .selectUtxosFrom(utxos)
      .complete();

    return txHex;
  };

  updateContent = async ({
    ownerTokenUtxo,
    registryNumber,
    newContentHashHex,
    contentNumber,
  }: UpdateContent) => {
    const { utxos, collateral, walletAddress } =
      await this.getWalletInfoForTx();
    const registryTokenNameHex = stringToHex(`Registry (${registryNumber})`);
    const [oracle, content, ownership] =
      await this.getScriptUtxos(registryNumber);
    const newContentRegistry = this.updateContentRegistry(
      content!.output.plutusData!,
      contentNumber,
      newContentHashHex,
    );

    await this.mesh
      .txIn(
        ownerTokenUtxo.input.txHash,
        ownerTokenUtxo.input.outputIndex,
        ownerTokenUtxo.output.amount,
        ownerTokenUtxo.output.address,
      )
      .spendingPlutusScriptV3()
      .txIn(
        content!.input.txHash,
        content!.input.outputIndex,
        content!.output.amount,
        content!.output.address,
      )
      .txInInlineDatumPresent()
      .txInRedeemerValue(mConStr(1, [newContentHashHex, contentNumber]))
      .spendingTxInReference(
        this.refScriptUtxos.contentRegistry.txHash,
        this.refScriptUtxos.contentRegistry.outputIndex,
        (this.scriptInfo.contentRegistry.cbor.length / 2).toString(),
        this.scriptInfo.contentRegistry.hash,
      )
      .txOut(this.scriptInfo.contentRegistry.address, [
        {
          unit: this.scriptInfo.contentRefToken.hash + registryTokenNameHex,
          quantity: "1",
        },
      ])
      .txOutInlineDatumValue(newContentRegistry)
      .readOnlyTxInReference(oracle!.input.txHash, oracle!.input.outputIndex)
      .readOnlyTxInReference(
        ownership!.input.txHash,
        ownership!.input.outputIndex,
      )
      .changeAddress(walletAddress)
      .txInCollateral(
        collateral.input.txHash,
        collateral.input.outputIndex,
        collateral.output.amount,
        collateral.output.address,
      )
      .selectUtxosFrom(utxos)
      .complete();
    const txBody = this.mesh.completeSigning();
    return txBody;
  };

  transferContent = async ({
    ownerTokenUtxo,
    registryNumber,
    newOwnerAssetHex,
    contentNumber,
  }: TransferContent) => {
    const { utxos, collateral, walletAddress } =
      await this.getWalletInfoForTx();
    const registryTokenNameHex = stringToHex(`Registry (${registryNumber})`);
    const [oracle, ownership] = await this.getScriptUtxos(registryNumber, [
      "oracle",
      "ownership",
    ]);
    const newOwnerAssetClass: [string, string] = [
      newOwnerAssetHex.slice(0, 56),
      newOwnerAssetHex.slice(56),
    ];
    const newOwnershipRegistry = this.updateOwnershipRegistry(
      ownership!.output.plutusData!,
      contentNumber,
      newOwnerAssetClass,
    );

    await this.mesh
      .txIn(
        ownerTokenUtxo.input.txHash,
        ownerTokenUtxo.input.outputIndex,
        ownerTokenUtxo.output.amount,
        ownerTokenUtxo.output.address,
      )
      .spendingPlutusScriptV3()
      .txIn(
        ownership!.input.txHash,
        ownership!.input.outputIndex,
        ownership!.output.amount,
        ownership!.output.address,
      )
      .txInInlineDatumPresent()
      .txInRedeemerValue(mConStr(1, [newOwnerAssetClass, contentNumber]))
      .spendingTxInReference(
        this.refScriptUtxos.ownershipRegistry.txHash,
        this.refScriptUtxos.ownershipRegistry.outputIndex,
        (this.scriptInfo.ownershipRegistry.cbor.length / 2).toString(),
        this.scriptInfo.ownershipRegistry.hash,
      )
      .txOut(this.scriptInfo.ownershipRegistry.address, [
        {
          unit: this.scriptInfo.ownershipRefToken.hash + registryTokenNameHex,
          quantity: "1",
        },
      ])
      .txOutInlineDatumValue(newOwnershipRegistry)
      .readOnlyTxInReference(oracle!.input.txHash, oracle!.input.outputIndex)
      .changeAddress(walletAddress)
      .txInCollateral(
        collateral.input.txHash,
        collateral.input.outputIndex,
        collateral.output.amount,
        collateral.output.address,
      )
      .selectUtxosFrom(utxos)
      .complete();
    const txBody = this.mesh.completeSigning();
    return txBody;
  };

  // Admin

  stopContentRegistry = async (registryNumber: number) => {
    const { utxos, collateral, walletAddress } =
      await this.getWalletInfoForTx();
    const registryTokenNameHex = stringToHex(`Registry (${registryNumber})`);
    const scriptUtxos = await this.fetcher!.fetchAddressUTxOs(
      this.scriptInfo.contentRegistry.address,
      this.scriptInfo.contentRefToken.hash + registryTokenNameHex,
    );
    const oracleUtxo = await this.fetcher!.fetchAddressUTxOs(
      this.scriptInfo.oracleValidator.address,
      this.scriptInfo.oracleNFT.hash,
    );
    const { txHash: oracleTxHash, outputIndex: oracleTxId } =
      oracleUtxo[0]!.input;
    const { txHash: validatorTxHash, outputIndex: validatorTxId } =
      scriptUtxos[0]!.input;

    const txHex = await this.mesh
      .spendingPlutusScriptV3()
      .txIn(validatorTxHash, validatorTxId)
      .txInInlineDatumPresent()
      .txInRedeemerValue(mConStr(2, []))
      .txInScript(this.scriptInfo.contentRegistry.cbor)
      .mintPlutusScriptV2()
      .mint("-1", this.scriptInfo.contentRefToken.hash, registryTokenNameHex)
      .mintTxInReference(
        this.refScriptUtxos.contentRefToken.txHash,
        this.refScriptUtxos.contentRefToken.outputIndex,
        (this.scriptInfo.contentRefToken.cbor.length / 2).toString(),
        this.scriptInfo.contentRefToken.hash,
      )
      .mintRedeemerValue(mConStr1([]))
      .readOnlyTxInReference(oracleTxHash, oracleTxId)
      .changeAddress(walletAddress)
      .txInCollateral(
        collateral.input.txHash,
        collateral.input.outputIndex,
        collateral.output.amount,
        collateral.output.address,
      )
      .requiredSignerHash(this.stopKey)
      .selectUtxosFrom(utxos)
      .complete();

    return txHex;
  };

  stopOwnershipRegistry = async (registryNumber: number) => {
    const { utxos, collateral, walletAddress } =
      await this.getWalletInfoForTx();
    const registryTokenNameHex = stringToHex(`Registry (${registryNumber})`);
    const scriptUtxos = await this.fetcher!.fetchAddressUTxOs(
      this.scriptInfo.ownershipRegistry.address,
      this.scriptInfo.ownershipRefToken.hash + registryTokenNameHex,
    );
    const oracleUtxo = await this.fetcher!.fetchAddressUTxOs(
      this.scriptInfo.oracleValidator.address,
      this.scriptInfo.oracleNFT.hash,
    );
    const { txHash: oracleTxHash, outputIndex: oracleTxId } =
      oracleUtxo[0]!.input;
    const { txHash: validatorTxHash, outputIndex: validatorTxId } =
      scriptUtxos[0]!.input;

    const txHex = await this.mesh
      .spendingPlutusScriptV3()
      .txIn(validatorTxHash, validatorTxId)
      .txInInlineDatumPresent()
      .txInRedeemerValue(mConStr(2, []))
      .txInScript(this.scriptInfo.ownershipRegistry.cbor)
      .mintPlutusScriptV2()
      .mint("-1", this.scriptInfo.ownershipRefToken.hash, registryTokenNameHex)
      .mintTxInReference(
        this.refScriptUtxos.ownershipRefToken.txHash,
        this.refScriptUtxos.ownershipRefToken.outputIndex,
        (this.scriptInfo.ownershipRefToken.cbor.length / 2).toString(),
        this.scriptInfo.ownershipRefToken.hash,
      )
      .mintRedeemerValue(mConStr1([]))
      .readOnlyTxInReference(oracleTxHash, oracleTxId)
      .changeAddress(walletAddress)
      .txInCollateral(
        collateral.input.txHash,
        collateral.input.outputIndex,
        collateral.output.amount,
        collateral.output.address,
      )
      .requiredSignerHash(this.stopKey)
      .selectUtxosFrom(utxos)
      .complete();

    return txHex;
  };

  stopOracle = async (txInHash: string, txInId: number) => {
    const { utxos, collateral, walletAddress } =
      await this.getWalletInfoForTx();

    const oracleUtxo = await this.fetcher!.fetchAddressUTxOs(
      this.scriptInfo.oracleValidator.address,
      this.scriptInfo.oracleNFT.hash,
    );
    const { txHash, outputIndex } = oracleUtxo[0]!.input;

    const txHex = await this.mesh
      .txIn(txInHash, txInId)
      .spendingPlutusScriptV3()
      .txIn(txHash, outputIndex)
      .txInInlineDatumPresent()
      .txInRedeemerValue(mConStr(3, []))
      .txInScript(this.scriptInfo.oracleValidator.cbor)
      .mintPlutusScriptV2()
      .mint("-1", this.scriptInfo.oracleNFT.hash, "")
      .mintingScript(this.scriptInfo.oracleNFT.cbor)
      .mintRedeemerValue(mConStr1([]))
      .changeAddress(walletAddress)
      .txInCollateral(
        collateral.input.txHash,
        collateral.input.outputIndex,
        collateral.output.amount,
        collateral.output.address,
      )
      .requiredSignerHash(this.opsKey)
      .requiredSignerHash(this.stopKey)
      .selectUtxosFrom(utxos)
      .complete();

    return txHex;
  };

  // Helpers

  protected getCurrentOracleDatum = async (utxos?: UTxO[]) => {
    let oracleUtxo: UTxO[] = utxos || [];
    if (oracleUtxo.length === 0) {
      oracleUtxo = await this.fetcher!.fetchAddressUTxOs(
        this.scriptInfo.oracleValidator.address,
        this.scriptInfo.oracleNFT.hash,
      );
    }
    const oracleDatum = parseInlineDatum<any, OracleDatum>({
      inline_datum: oracleUtxo[0]!.output.plutusData!,
    });
    return oracleDatum;
  };

  protected getOracleDatum = (
    contentRegistryCount: number,
    ownershipRegistryCount: number,
  ) => {
    const oracleAddr = mScriptAddress(
      this.scriptInfo.oracleValidator.hash,
      this.stakeCredential,
    );
    const contentRegistryAddr = mScriptAddress(
      this.scriptInfo.contentRegistry.hash,
      this.stakeCredential,
    );
    const ownershipRegistryAddr = mScriptAddress(
      this.scriptInfo.ownershipRegistry.hash,
      this.stakeCredential,
    );

    return mConStr0([
      this.scriptInfo.oracleNFT.hash,
      oracleAddr,
      this.scriptInfo.contentRefToken.hash,
      contentRegistryAddr,
      contentRegistryCount,
      this.scriptInfo.ownershipRefToken.hash,
      ownershipRegistryAddr,
      ownershipRegistryCount,
      this.opsKey,
      this.stopKey,
    ]);
  };

  protected getContentDatum = (contentArray: string[]) => {
    return mConStr0([contentArray.length, contentArray]);
  };

  protected getOwnershipDatum = (ownershipArray: [string, string][]) => {
    return mConStr0([ownershipArray.length, ownershipArray]);
  };

  getScriptUtxos = async (
    registryNumber: number,
    toFetch: ("oracle" | "content" | "ownership")[] = [
      "oracle",
      "content",
      "ownership",
    ],
  ) => {
    const registryTokenNameHex = stringToHex(`Registry (${registryNumber})`);
    const promises: Promise<UTxO[]>[] = [];
    toFetch.forEach((script) => {
      switch (script) {
        case "oracle":
          promises.push(
            this.fetcher!.fetchAddressUTxOs(
              this.scriptInfo.oracleValidator.address,
              this.scriptInfo.oracleNFT.hash,
            ),
          );
          break;
        case "content":
          promises.push(
            this.fetcher!.fetchAddressUTxOs(
              this.scriptInfo.contentRegistry.address,
              this.scriptInfo.contentRefToken.hash + registryTokenNameHex,
            ),
          );
        case "ownership":
          promises.push(
            this.fetcher!.fetchAddressUTxOs(
              this.scriptInfo.ownershipRegistry.address,
              this.scriptInfo.ownershipRefToken.hash + registryTokenNameHex,
            ),
          );
          break;
      }
    });
    const scriptsInput = await Promise.all(promises);
    return scriptsInput.map((utxos) => utxos[0]);
  };

  private insertContentRegistry = (
    plutusData: string,
    newContentHash: string,
  ): Data => {
    const contentRegistry = parseInlineDatum<any, ContentRegistryDatum>({
      inline_datum: plutusData,
    }).fields[1].list.map((plutusBytes) => plutusBytes.bytes);
    const newContentRegistry = this.getContentDatum([
      ...contentRegistry,
      newContentHash,
    ]);
    return newContentRegistry;
  };

  private insertOwnershipRegistry = (
    plutusData: string,
    ownerAssetClass: [string, string],
  ): Data => {
    const ownershipRegistry = parseInlineDatum<any, OwnershipRegistryDatum>({
      inline_datum: plutusData,
    }).fields[1].list.map((plutusBytesArray): [string, string] => [
      plutusBytesArray.list[0].bytes,
      plutusBytesArray.list[1].bytes,
    ]);
    const newContentRegistry = this.getOwnershipDatum([
      ...ownershipRegistry,
      ownerAssetClass,
    ]);
    return newContentRegistry;
  };

  private updateContentRegistry = (
    plutusData: string,
    contentNumber: number,
    newContentHash: string,
  ): Data => {
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
    ownerAssetClass: [string, string],
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
