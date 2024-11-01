import {
  builtinByteString,
  bytesToHex,
  Data,
  deserializeAddress,
  ForgeScript,
  fromUTF8,
  mConStr,
  mConStr0,
  mConStr1,
  mOutputReference,
  mScriptAddress,
  NativeScript,
  resolveScriptHash,
  serializeNativeScript,
  stringToHex,
  toUTF8,
  UTxO,
} from "@meshsdk/core";
import {
  applyParamsToScript,
  parseDatumCbor,
  parseInlineDatum,
} from "@meshsdk/core-csl";

import { MeshTxInitiator, MeshTxInitiatorInput } from "../../common";
import { blueprint, getScriptCbor, getScriptInfo, ScriptIndex } from "./common";
import {
  ContentRegistryDatum,
  OracleDatum,
  OwnershipRegistryDatum,
  TransferContent,
  UpdateContent,
} from "./type";

/**
 * Mesh Content Ownership Contract
 *
 * This contract is used to manage the ownership of content.
 * It facilitates on-chain record of content (i.e. file on IPFS) ownership and transfer.
 * While one cannot prefer others from obtaining a copy of the content, the app owner of the
 * contract can serve the single source of truth of who owns the content. With the blockchain
 * trace and record in place, it provides a trustless way to verify the ownership of the content
 * and facilitates further application logics such as royalties, licensing, etc.
 *
 * @example
 * ```typescript
 *  const meshTxBuilder = new MeshTxBuilder({
 *   fetcher: blockchainProvider, // one of the Providers
 *   submitter: blockchainProvider,
 *   verbose: true,
 * });
 *
 * const contract = new MeshContentOwnershipContract(
 *   {
 *     mesh: meshTxBuilder,
 *     fetcher: blockchainProvider,
 *     wallet: wallet,
 *     networkId: 0,
 *   },
 *   {
 *     operationAddress: operationAddress, // the address of the app owner, where most of the actions should be signed by the spending key of this address
 *     paramUtxo: { outputIndex: 0, txHash: "0000000000000000000000000000000000000000000000000000000000000000" }, // you can get this from the output of `mintOneTimeMintingPolicy()` transaction
 *     refScriptUtxos?: { // you can get these from the output of `sendRefScriptOnchain()` transactions
 *       contentRegistry: { outputIndex: 0, txHash: "0000000000000000000000000000000000000000000000000000000000000000" },
 *       contentRefToken: { outputIndex: 0, txHash: "0000000000000000000000000000000000000000000000000000000000000000" },
 *       ownershipRegistry: { outputIndex: 0, txHash: "0000000000000000000000000000000000000000000000000000000000000000" },
 *       ownershipRefToken: { outputIndex: 0, txHash: "0000000000000000000000000000000000000000000000000000000000000000" },
 *     },
 *   },
 * );
 * ```
 */
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
  operationAddress: string;
  opsKey: string;

  constructor(
    inputs: MeshTxInitiatorInput,
    contract: {
      operationAddress: string;
      paramUtxo?: UTxO["input"];
      refScriptUtxos?: {
        contentRegistry: UTxO["input"];
        contentRefToken: UTxO["input"];
        ownershipRegistry: UTxO["input"];
        ownershipRefToken: UTxO["input"];
      };
    },
  ) {
    super(inputs);

    this.paramUtxo = contract.paramUtxo || this.paramUtxo;
    this.refScriptUtxos = contract.refScriptUtxos || this.refScriptUtxos;

    this.scriptInfo = getScriptInfo(
      this.paramUtxo,
      this.stakeCredential,
      this.networkId,
    );

    this.operationAddress = contract.operationAddress;

    const serializedOpsPlutusAddr = deserializeAddress(this.operationAddress);
    this.opsKey = serializedOpsPlutusAddr.pubKeyHash;
  }

  getOwnerNativeScript = () => {
    const { pubKeyHash: keyHash } = deserializeAddress(this.operationAddress);
    const nativeScript: NativeScript = {
      type: "all",
      scripts: [
        {
          type: "sig",
          keyHash: keyHash,
        },
      ],
    };

    const { address: scriptAddress } = serializeNativeScript(
      nativeScript,
      undefined,
      this.networkId,
    );

    return {
      nativeScript,
      scriptAddress,
    };
  };

  /**
   * [Setup phase]
   * This is the first transaction you need to setup the contract.
   *
   * This transaction mints the one-time minting policy (a NFT) for the contract.
   * It will be attached with the datum which serves as the single source of truth for the contract oracle.
   *
   * Note: You must save the `paramUtxo` for future transactions.
   *
   * @returns {Promise<{ txHexMintOneTimeMintingPolicy: string, txHexSetupOracleUtxo: string, paramUtxo: UTxO["input"] }>}
   *
   * @example
   * ```typescript
   * const { tx, paramUtxo } = await contract.mintOneTimeMintingPolicy();
   * const signedTx = await wallet.signTx(tx);
   * const txHash = await wallet.submitTx(signedTx);
   * ```
   */
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
      .selectUtxosFrom(utxos)
      .complete();

    this.scriptInfo = getScriptInfo(
      paramUtxo.input,
      this.stakeCredential,
      this.networkId,
    );

    this.paramUtxo = paramUtxo.input;

    return { tx: txHex, paramUtxo: paramUtxo.input };
  };

  /**
   * [Setup phase]
   * This is the second transaction you need to setup the contract.
   *
   * This transaction send the NFT to a oracle contract locking the datum,
   * which serves as the single source of truth for the contract oracle with data integrity.
   *
   * Note: You must provide the `paramUtxo` from the `mintOneTimeMintingPolicy` transaction.
   *
   * @returns {Promise<string>}
   *
   * @example
   * ```typescript
   * const txHex = await contract.setupOracleUtxo();
   * const signedTx = await wallet.signTx(txHex);
   * const txHash = await wallet.submitTx(signedTx);
   * ```
   */
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

  /**
   * [Setup phase]
   * This are the next transactions you need to setup the contract.
   * You need to run once for each script, and you would likely have to run one after the previous one is confirmed.
   *
   * This transaction sends the reference scripts to the blockchain for later transactions,
   * boosting efficiency and avoid exceeding 16kb of transaction size limits enforced by protocol parameter.
   *
   * Note: You must provide the `paramUtxo` from the `mintOneTimeMintingPolicy` transaction.
   * Note: You must save txHash (after signed and submitted) for `ContentRegistry`, `ContentRefToken`, `OwnershipRegistry`, `OwnershipRefToken` transactions for future transactions.
   *
   * @param scriptIndex - "OracleNFT" | "OracleValidator" | "ContentRegistry" | "ContentRefToken" | "OwnershipRegistry" | "OwnershipRefToken"
   * @returns {Promise<string>}
   *
   * @example
   * ```typescript
   * const txHexOracleNFT = await contract.sendRefScriptOnchain("OracleNFT");
   * const signedTxOracleNFT = await wallet.signTx(txHexOracleNFT);
   * const txHashOracleNFT = await wallet.submitTx(signedTxOracleNFT);
   *
   * const txHexOracleValidator = await contract.sendRefScriptOnchain("OracleValidator");
   * ... // repeat for each script
   *
   * const txHexOwnershipRefToken = await contract.sendRefScriptOnchain("OwnershipRefToken");
   * const signedTxOwnershipRefToken = await wallet.signTx(txHexOwnershipRefToken);
   * const txHashOwnershipRefToken = await wallet.submitTx(signedTxOwnershipRefToken);
   * ```
   */
  sendRefScriptOnchain = async (scriptIndex: ScriptIndex) => {
    const { utxos, walletAddress } = await this.getWalletInfoForTx();
    const { scriptAddress } = this.getOwnerNativeScript();
    const txHex = await this.mesh
      .txOut(scriptAddress, [])
      .txOutReferenceScript(getScriptCbor(this.paramUtxo, scriptIndex))
      .changeAddress(walletAddress)
      .selectUtxosFrom(utxos, "experimental", "20000000")
      .complete();
    return txHex;
  };

  /**
   * [Setup phase]
   * This is the next transaction you need to setup the contract after completing all the `sendRefScriptOnchain` transactions.
   *
   * This transaction creates one content registry. Each registry should comes in pair with one ownership registry and
   * each pair of registry serves around 50 records of content ownership. The application can be scaled indefinitely
   * according to the number of parallelization needed and volumes of content expected to be managed.
   *
   * Note: You must provide the `paramUtxo` from the `mintOneTimeMintingPolicy` transaction.
   * Note: You must provide the txHash for `ContentRegistry`, `ContentRefToken`, `OwnershipRegistry`, `OwnershipRefToken`
   *
   * @returns {Promise<string>}
   *
   * @example
   * ```typescript
   * const txHex = await contract.createContentRegistry();
   * const signedTx = await wallet.signTx(txHex);
   * const txHash = await wallet.submitTx(signedTx);
   * ```
   */
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
    const {
      input: { txHash: oracleTxHash, outputIndex: oracleTxId },
      output: { address: oracleAddress, amount: oracleValue },
    } = scriptUtxo[0]!;
    const oracleDatumValue = this.getOracleDatum(
      contentNumber + 1,
      ownershipNumber,
    );
    console.log("Oracle Datum", oracleDatumValue);
    console.log("this.refScriptUtxos", this.refScriptUtxos);

    const txHex = await this.mesh
      .spendingPlutusScriptV3()
      .txIn(oracleTxHash, oracleTxId, oracleValue, oracleAddress)
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
      .selectUtxosFrom(utxos, "largestFirstMultiAsset")
      .complete();

    return txHex;
  };

  /**
   * [Setup phase]
   * This is the last transaction you need to setup the contract after completing all the `sendRefScriptOnchain` transactions.
   *
   * This transaction creates one content registry. Each registry should comes in pair with one content registry and
   * each pair of registry serves around 50 records of content ownership. The application can be scaled indefinitely
   * according to the number of parallelization needed and volumes of content expected to be managed.
   *
   * Note: You must provide the `paramUtxo` from the `mintOneTimeMintingPolicy` transaction.
   * Note: You must provide the txHash for `ContentRegistry`, `ContentRefToken`, `OwnershipRegistry`, `OwnershipRefToken`
   *
   * @returns {Promise<string>}
   *
   * @example
   * ```typescript
   * const txHex = await contract.createOwnershipRegistry();
   * const signedTx = await wallet.signTx(txHex);
   * const txHash = await wallet.submitTx(signedTx);
   * ```
   */
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
    const {
      input: { txHash: oracleTxHash, outputIndex: oracleTxId },
      output: { address: oracleAddress, amount: oracleValue },
    } = scriptUtxo[0]!;
    const oracleDatumValue = this.getOracleDatum(
      contentNumber,
      ownershipNumber + 1,
    );
    console.log("Oracle Datum", oracleDatumValue);

    const txHex = await this.mesh
      .spendingPlutusScriptV3()
      .txIn(oracleTxHash, oracleTxId, oracleValue, oracleAddress)
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
      .selectUtxosFrom(utxos, "largestFirstMultiAsset")
      .complete();

    return txHex;
  };

  /**
   * Get the current oracle data.
   *
   * @returns {Promise<{
   *  contentNumber: number,
   *  ownershipNumber: number,
   * }>}
   *
   * @example
   * ```typescript
   * const oracleData = await contract.getOracleData();
   * ```
   */
  getOracleData = async () => {
    const scriptUtxo = await this.fetcher!.fetchAddressUTxOs(
      this.scriptInfo.oracleValidator.address,
      this.scriptInfo.oracleNFT.hash,
    );
    const currentOracleDatum = await this.getCurrentOracleDatum(scriptUtxo);

    const contentNumber = currentOracleDatum.fields[4].int as number;
    const ownershipNumber = currentOracleDatum.fields[7].int as number;

    return {
      contentNumber,
      ownershipNumber,
    };
  };

  /**
   * [User]
   *
   * This transaction mints a user token which can be used to represent the ownership of the content. This token is used in `createContent()` transaction.
   *
   * @param tokenName - The name of the token that you can specify.
   * @param tokenMetadata - The metadata of the token that you can specify.
   * @returns {Promise<string>}
   *
   * @example
   * ```typescript
   * const tx = await contract.mintUserToken("MeshContentOwnership", {
   *   name: "Mesh Content Ownership",
   *   description: "Demo at https://meshjs.dev/smart-contracts/content-ownership",
   * });
   * const signedTx = await wallet.signTx(tx, true);
   * const txHash = await wallet.submitTx(signedTx);
   */
  mintUserToken = async (tokenName: string, tokenMetadata = {}) => {
    const { utxos, walletAddress } = await this.getWalletInfoForTx();

    const { pubKeyHash: keyHash } = deserializeAddress(walletAddress);
    const nativeScript: NativeScript = {
      type: "all",
      scripts: [
        {
          type: "sig",
          keyHash: keyHash,
        },
      ],
    };

    const forgingScript = ForgeScript.fromNativeScript(nativeScript);

    const policyId = resolveScriptHash(forgingScript);
    const tokenNameHex = stringToHex(tokenName);
    const metadata = { [policyId]: { [tokenName]: { ...tokenMetadata } } };

    const txHex = await this.mesh
      .mint("1", policyId, tokenNameHex)
      .mintingScript(forgingScript)
      .metadataValue("721", metadata)
      .changeAddress(walletAddress)
      .selectUtxosFrom(utxos)
      .complete();

    return txHex;
  };

  /**
   *
   * @param ownerAssetHex
   * @param contentHashHex
   * @param registryNumber
   * @returns
   */
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
    const {
      input: { txHash: ownershipTxHash, outputIndex: ownershipTxId },
      output: { amount: ownershipValue, address: ownershipAddress },
    } = ownershipUtxo[0]!;
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
      .txIn(ownershipTxHash, ownershipTxId, ownershipValue, ownershipAddress)
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

  /**
   * Get the content at the registry given the registry number and content number.
   * @param registryNumber
   * @param contentNumber
   * @returns
   */
  getContent = async (registryNumber: number, contentNumber: number) => {
    const [content] = await this.getScriptUtxos(registryNumber, ["content"]);

    if (content === undefined) throw new Error("Content registry not found");

    const contentDatam: ContentRegistryDatum = parseDatumCbor(
      content.output.plutusData!,
    );

    const contentAtRegistry = contentDatam.fields[1].list;

    if (contentAtRegistry.length <= contentNumber)
      throw new Error("Content not found");

    const decoded = toUTF8(contentAtRegistry[contentNumber]?.bytes!);

    return decoded;
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
    const {
      input: { txHash: validatorTxHash, outputIndex: validatorTxId },
      output: { amount: scriptValue, address: scriptAddress },
    } = scriptUtxos[0]!;

    const txHex = await this.mesh
      .spendingPlutusScriptV3()
      .txIn(validatorTxHash, validatorTxId, scriptValue, scriptAddress)
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
      .requiredSignerHash(this.opsKey)
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
    const {
      input: { txHash: validatorTxHash, outputIndex: validatorTxId },
      output: { amount: scriptValue, address: scriptAddress },
    } = scriptUtxos[0]!;

    const txHex = await this.mesh
      .spendingPlutusScriptV3()
      .txIn(validatorTxHash, validatorTxId, scriptValue, scriptAddress)
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
      .requiredSignerHash(this.opsKey)
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
      .requiredSignerHash(this.opsKey)
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
      this.opsKey,
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
