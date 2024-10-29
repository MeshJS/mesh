import {
  AssetMetadata,
  conStr0,
  Data,
  integer,
  mConStr0,
  mOutputReference,
  mPubKeyAddress,
  stringToHex,
} from "@meshsdk/common";
import {
  deserializeAddress,
  resolveScriptHash,
  serializeAddressObj,
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

/**
 * Mesh Plutus NFT contract class
 * 
 * This NFT minting script enables users to mint NFTs with an automatically incremented index, which increases by one for each newly minted NFT. 
 * 
 * To facilitate this process, the first step is to set up a one-time minting policy by minting an oracle token. This oracle token is essential as it holds the current state and index of the NFTs, acting as a reference for the minting sequence. 
 * 
 * With each new NFT minted, the token index within the oracle is incremented by one, ensuring a consistent and orderly progression in the numbering of the NFTs.
 */
export class MeshPlutusNFTContract extends MeshTxInitiator {
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
    return applyParamsToScript(blueprint.validators[4]!.compiledCode, [
      stringToHex(this.collectionName),
      oracleNftPolicyId,
    ]);
  };

  constructor(
    inputs: MeshTxInitiatorInput,
    contract: {
      collectionName: string;
      paramUtxo?: UTxO["input"];
    },
  ) {
    super(inputs);
    this.collectionName = contract.collectionName;
    if (contract.paramUtxo) {
      this.paramUtxo = contract.paramUtxo;
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

  /**
   * Set up a one-time minting policy by minting an oracle token. This oracle token is essential as it holds the current state and index of the NFTs, acting as a reference for the minting sequence.
   * @param lovelacePrice - Price of the NFT in lovelace
   * @returns - Transaction hex and paramUtxo
   *
   * @example
   * ```typescript
   * const { tx, paramUtxo } = await contract.setupOracle(lovelacePrice);
   * ```
   */
  setupOracle = async (lovelacePrice: number) => {
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
    const { pubKeyHash, stakeCredentialHash } =
      deserializeAddress(walletAddress);

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
      .txOutInlineDatumValue(
        mConStr0([
          0,
          lovelacePrice,
          mPubKeyAddress(pubKeyHash, stakeCredentialHash),
        ]),
      )
      .txInCollateral(
        collateral.input.txHash,
        collateral.input.outputIndex,
        collateral.output.amount,
        collateral.output.address,
      )
      .changeAddress(walletAddress)
      .selectUtxosFrom(utxos)
      .complete();

    this.paramUtxo = paramUtxo.input;

    return { tx: txHex, paramUtxo: paramUtxo.input };
  };

  /**
   * Mint NFT token with an automatically incremented index, which increases by one for each newly minted NFT.
   * @param assetMetadata - Asset metadata
   * @returns - Transaction hex
   *
   * @example
   * ```typescript
   * const assetMetadata = {
   *  ...demoAssetMetadata,
   * name: `Mesh Token ${oracleData.nftIndex}`,
   * };
   * const tx = await contract.mintPlutusNFT(assetMetadata);
   * ```
   */
  mintPlutusNFT = async (assetMetadata?: AssetMetadata) => {
    const { utxos, collateral, walletAddress } =
      await this.getWalletInfoForTx();
    if (utxos?.length <= 0) {
      throw new Error("No UTxOs found");
    }

    const {
      nftIndex,
      policyId,
      lovelacePrice,
      oracleUtxo,
      oracleNftPolicyId,
      feeCollectorAddress,
      feeCollectorAddressObj,
    } = await this.getOracleData();

    const tokenName = `${this.collectionName} (${nftIndex})`;
    const tokenNameHex = stringToHex(tokenName);

    const updatedOracleDatum: OracleDatum = conStr0([
      integer((nftIndex as number) + 1),
      integer(lovelacePrice),
      feeCollectorAddressObj,
    ]);

    const tx = this.mesh
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
      .txOut(this.oracleAddress, [{ unit: oracleNftPolicyId, quantity: "1" }])
      .txOutInlineDatumValue(updatedOracleDatum, "JSON")
      .mintPlutusScriptV3()
      .mint("1", policyId, tokenNameHex)
      .mintingScript(this.getNFTCbor());

    if (assetMetadata) {
      const metadata = { [policyId]: { [tokenName]: { ...assetMetadata } } };
      tx.metadataValue("721", metadata);
    }

    tx.mintRedeemerValue(mConStr0([]))
      .txOut(feeCollectorAddress, [
        { unit: "lovelace", quantity: lovelacePrice.toString() },
      ])
      .txInCollateral(
        collateral.input.txHash,
        collateral.input.outputIndex,
        collateral.output.amount,
        collateral.output.address,
      )
      .changeAddress(walletAddress)
      .selectUtxosFrom(utxos);

    const txHex = await tx.complete();
    return txHex;
  };

  /**
   * Get the current oracle data.
   *
   * @returns - Oracle data
   *
   * @example
   * ```typescript
   * const oracleData = await contract.getOracleData();
   * ```
   */
  getOracleData = async () => {
    const oracleNftPolicyId = resolveScriptHash(this.getOracleNFTCbor(), "V3");
    const oracleUtxo = (
      await this.getAddressUtxosWithToken(this.oracleAddress, oracleNftPolicyId)
    )[0]!;
    const oracleDatum: OracleDatum = parseDatumCbor(
      oracleUtxo!.output.plutusData!,
    );

    const nftIndex = oracleDatum.fields[0].int;
    const lovelacePrice = oracleDatum.fields[1].int;
    const feeCollectorAddressObj = oracleDatum.fields[2];
    const feeCollectorAddress = serializeAddressObj(
      feeCollectorAddressObj,
      this.networkId,
    );

    const policyId = resolveScriptHash(this.getNFTCbor(), "V3");

    return {
      nftIndex,
      policyId,
      lovelacePrice,
      oracleUtxo,
      oracleNftPolicyId,
      feeCollectorAddress,
      feeCollectorAddressObj,
    };
  };

  getUtxoByTxHash = async (txHash: string): Promise<UTxO | undefined> => {
    return await this._getUtxoByTxHash(txHash);
  };
}
