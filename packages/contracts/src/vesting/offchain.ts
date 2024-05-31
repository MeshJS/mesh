import { MeshTxInitiator, MeshTxInitiatorInput } from '@mesh/common';
import {
  serializeBech32Address,
  applyParamsToScript,
  v2ScriptToBech32,
  parseDatumCbor,
} from '@meshsdk/core-csl';
import {
  mConStr0,
  unixTimeToEnclosingSlot,
  SLOT_CONFIG_NETWORK,
  ConStr0,
  Integer,
  BuiltinByteString,
} from '@meshsdk/common';
import blueprint from './aiken-workspace/plutus.json';
import { Asset, UTxO } from '@meshsdk/core';

export type VestingDatum = ConStr0<
  [Integer, BuiltinByteString, BuiltinByteString]
>;

export class MeshVestingContract extends MeshTxInitiator {
  scriptCbor = applyParamsToScript(blueprint.validators[0].compiledCode, []);

  constructor(inputs: MeshTxInitiatorInput) {
    super(inputs);
  }

  depositFund = async (
    amount: Asset[],
    lockUntilTimeStampMs: number,
    beneficiary: string
  ): Promise<string> => {
    const { utxos, walletAddress } = await this.getWalletInfoForTx();
    const scriptAddr = v2ScriptToBech32(
      this.scriptCbor,
      undefined,
      this.networkId
    );
    const { pubKeyHash: ownerPubKeyHash } =
      serializeBech32Address(walletAddress);
    const { pubKeyHash: beneficiaryPubKeyHash } =
      serializeBech32Address(beneficiary);

    await this.mesh
      .txOut(scriptAddr, amount)
      .txOutInlineDatumValue(
        mConStr0([lockUntilTimeStampMs, ownerPubKeyHash, beneficiaryPubKeyHash])
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
    const scriptAddr = v2ScriptToBech32(
      this.scriptCbor,
      undefined,
      this.networkId
    );
    const { pubKeyHash } = serializeBech32Address(walletAddress);

    const datum = parseDatumCbor<VestingDatum>(vestingUtxo.output.plutusData!);

    const invalidBefore =
      unixTimeToEnclosingSlot(
        Math.min(datum.fields[0].int, Date.now() - 15000),
        this.networkId === 0
          ? SLOT_CONFIG_NETWORK.preprod
          : SLOT_CONFIG_NETWORK.mainnet
      ) + 1;

    await this.mesh
      .spendingPlutusScriptV2()
      .txIn(
        vestingUtxo.input.txHash,
        vestingUtxo.input.outputIndex,
        vestingUtxo.output.amount,
        scriptAddr
      )
      .spendingReferenceTxInInlineDatumPresent()
      .spendingReferenceTxInRedeemerValue('')
      .txInScript(this.scriptCbor)
      .txOut(walletAddress, [])
      .txInCollateral(
        collateralInput.txHash,
        collateralInput.outputIndex,
        collateralOutput.amount,
        collateralOutput.address
      )
      .invalidBefore(invalidBefore)
      .requiredSignerHash(pubKeyHash)
      .changeAddress(walletAddress)
      .selectUtxosFrom(utxos)
      .complete();
    return this.mesh.txHex;
  };

  getUtxoByTxHash = async (txHash: string): Promise<UTxO | undefined> => {
    return await this._getUtxoByTxHash(this.scriptCbor, txHash);
  };
}
