import {
  Asset,
  byteString,
  conStr0,
  conStr1,
  integer,
  list,
  POLICY_ID_LENGTH,
  stringToHex,
  UTxO,
} from "@meshsdk/common";
import { deserializeDatum } from "@meshsdk/core";
import {
  buildBaseAddress,
  CredentialType,
  deserializeAddress,
  Hash28ByteBase16,
} from "@meshsdk/core-cst";

import { MeshTxInitiator, MeshTxInitiatorInput } from "../../common";
import { Cip113_scripts_standard } from "./deployment/standard";
import cip113_scripts_subStandard from "./deployment/subStandard";
import { ProtocolBootstrapParams, RegistryDatum } from "./types";
import { parseRegistryDatum } from "./utils";

export class ProgrammableTokenContract extends MeshTxInitiator {
  params: ProtocolBootstrapParams;
  quantity: string;
  constructor(
    inputs: MeshTxInitiatorInput,
    params: ProtocolBootstrapParams,
    quantity: string,
  ) {
    {
      super(inputs);
      this.params = params;
      this.quantity = quantity;
    }
  }
  protocolParambootstrap = async () => {};

  registerToken = async (
    assetName: string,
    subStandardName: "issuance" | "transfer",
    recipientAddress?: string | null,
  ) => {
    const { utxos, walletAddress, collateral } =
      await this.getWalletInfoForTx();
    let thirdPartyScriptHash: string;

    const standardScript = new Cip113_scripts_standard(this.networkId);
    const substandardScript = new cip113_scripts_subStandard(this.networkId);

    const registry_spend = await standardScript.registry_spend(this.params);
    const registry_mint = await standardScript.registry_mint(this.params);
    const logic_base = await standardScript.programmable_logic_base(
      this.params,
    );
    const substandard_issue = await substandardScript.transfer_issue_withdraw();
    const issuance_mint = await standardScript.issuance_mint(
      this.params,
      substandard_issue.policy_id,
    );
    const substandard_transfer =
      await substandardScript.transfer_transfer_withdraw();

    const bootstrapTxHash = this.params.txHash;
    const protocolParamsUtxos = await this.fetcher?.fetchUTxOs(
      bootstrapTxHash,
      0,
    );

    if (!protocolParamsUtxos) {
      throw new Error("could not resolve protocol params");
    }

    const issuanceUtxos = await this.fetcher?.fetchUTxOs(bootstrapTxHash, 2);
    if (!issuanceUtxos) {
      throw new Error("Issuance UTXO not found");
    }

    const protocolParamsUtxo = protocolParamsUtxos[0];
    const issuanceUtxo = issuanceUtxos[0];

    if (!substandard_transfer._cbor) {
      throw new Error("Substandard transfer contract not found");
    }

    if (subStandardName === "issuance") {
      thirdPartyScriptHash = substandard_issue.policy_id;
    } else if (subStandardName === "transfer") {
      thirdPartyScriptHash = substandard_transfer.policy_id;
    } else {
      thirdPartyScriptHash = "";
    }

    const prog_token_policyId = issuance_mint.policy_id;
    const registryEntries = await this.fetcher?.fetchAddressUTxOs(
      registry_spend.address,
    );
    const registryEntriesDatums = registryEntries?.flatMap((utxo: UTxO) =>
      deserializeDatum(utxo.output.plutusData!),
    );

    const existingEntry = registryEntriesDatums
      ?.map(parseRegistryDatum)
      .filter((d): d is RegistryDatum => d !== null)
      .find((d) => d.key === prog_token_policyId);

    if (existingEntry) {
      throw new Error(`Token policy ${prog_token_policyId} already registered`); //check after if this is correct
    }

    const nodeToReplaceUtxo = registryEntries?.find((utxo) => {
      const datum = deserializeDatum(utxo.output.plutusData!);
      const parsedDatum = parseRegistryDatum(datum);

      if (!parsedDatum) {
        console.log("Could not parse registry datum");
        return false;
      }

      const after = parsedDatum.key.localeCompare(prog_token_policyId) < 0;
      const before = prog_token_policyId.localeCompare(parsedDatum.next) < 0;

      return after && before;
    });

    if (!nodeToReplaceUtxo) {
      throw new Error("Could not find node to replace");
    }

    const existingRegistryNodeDatum = parseRegistryDatum(
      deserializeDatum(nodeToReplaceUtxo.output.plutusData!),
    );

    if (!existingRegistryNodeDatum) {
      throw new Error("Could not parse current registry node");
    }

    const stake_credential = deserializeAddress(
      recipientAddress ? recipientAddress : walletAddress,
    )
      .asBase()
      ?.getStakeCredential().hash!;
    const targetAddress = buildBaseAddress(
      0,
      logic_base.policyId as Hash28ByteBase16,
      stake_credential,
    );

    const registryMintRedeemer = conStr1([
      byteString(prog_token_policyId),
      byteString(substandard_issue.policy_id),
    ]);

    const issuanceRedeemer = conStr0([
      conStr1([byteString(substandard_issue.policy_id)]),
    ]);

    const previous_node_datum = conStr0([
      byteString(existingRegistryNodeDatum.key),
      byteString(prog_token_policyId),
      byteString(existingRegistryNodeDatum.transferScriptHash),
      byteString(existingRegistryNodeDatum.thirdPartyScriptHash),
      byteString(existingRegistryNodeDatum.metadata),
    ]);

    const new_node_datum = conStr0([
      byteString(prog_token_policyId),
      byteString(existingRegistryNodeDatum.next),
      byteString(substandard_transfer.policy_id),
      byteString(thirdPartyScriptHash),
      byteString(""),
    ]);

    const directorySpendAssets: Asset[] = [
      { unit: "lovelace", quantity: "1500000" },
      { unit: registry_mint.policy_id, quantity: "1" },
    ];

    const directoryMintAssets: Asset[] = [
      { unit: "lovelace", quantity: "1500000" },
      { unit: registry_mint.policy_id + prog_token_policyId, quantity: "1" },
    ];

    const programmableTokenAssets: Asset[] = [
      { unit: "lovelace", quantity: "1500000" },
      {
        unit: prog_token_policyId + stringToHex(assetName),
        quantity: this.quantity,
      },
    ];

    const txHex = await this.mesh
      .spendingPlutusScriptV3()
      .txIn(nodeToReplaceUtxo.input.txHash, nodeToReplaceUtxo.input.outputIndex)
      .txInScript(registry_spend.cbor)
      .txInRedeemerValue(conStr0([]), "JSON")
      .txInInlineDatumPresent()
      .withdrawalPlutusScriptV3()
      .withdrawal(substandard_issue.address, "0")
      .withdrawalScript(substandard_issue._cbor)
      .withdrawalRedeemerValue(conStr0([]), "JSON")
      .mintPlutusScriptV3()
      .mint(this.quantity, prog_token_policyId, stringToHex(assetName))
      .mintingScript(issuance_mint.cbor)
      .mintRedeemerValue(issuanceRedeemer, "JSON")
      .mintPlutusScriptV3()
      .mint("1", registry_mint.policy_id, prog_token_policyId)
      .mintingScript(registry_mint.cbor)
      .mintRedeemerValue(registryMintRedeemer, "JSON")

      .txOut(targetAddress.toAddress().toBech32(), programmableTokenAssets)
      .txOutInlineDatumValue(conStr0([]), "JSON")
      .txOut(registry_spend.address, directorySpendAssets)
      .txOutInlineDatumValue(previous_node_datum, "JSON")
      .txOut(registry_spend.address, directoryMintAssets)
      .txOutInlineDatumValue(new_node_datum, "JSON")

      .readOnlyTxInReference(
        protocolParamsUtxo!.input.txHash,
        protocolParamsUtxo!.input.outputIndex,
      )
      .readOnlyTxInReference(
        issuanceUtxo!.input.txHash,
        issuanceUtxo!.input.outputIndex,
      )
      .txInCollateral(collateral.input.txHash, collateral.input.outputIndex)
      .selectUtxosFrom(utxos)
      .changeAddress(walletAddress)
      .complete();

    return txHex;
  };

  mintTokens = async (assetName: string, recipientAddress?: string | null) => {
    const { utxos, walletAddress, collateral } =
      await this.getWalletInfoForTx();
    const standardScript = new Cip113_scripts_standard(this.networkId);
    const substandardScript = new cip113_scripts_subStandard(this.networkId);

    const substandard_issue = await substandardScript.transfer_issue_withdraw();

    if (!substandard_issue.address) {
      throw new Error("Substandard issuance address not found");
    }

    const issuance_mint = await standardScript.issuance_mint(
      this.params,
      substandard_issue.policy_id,
    );
    const sender_cred = deserializeAddress(
      recipientAddress ? recipientAddress : walletAddress,
    ).asBase();
    if (!sender_cred) {
      throw new Error("Sender credential not found");
    }
    const logic_base = await standardScript.programmable_logic_base(
      this.params,
    );
    const logic_address = buildBaseAddress(
      0,
      logic_base.policyId as Hash28ByteBase16,
      sender_cred.getPaymentCredential().hash,
      CredentialType.ScriptHash,
      CredentialType.KeyHash,
    );
    const address = logic_address.toAddress().toBech32();
    console.log("target address", address);

    const issuanceRedeemer = conStr0([
      conStr1([byteString(substandard_issue.policy_id)]),
    ]);

    const programmableTokenAssets: Asset[] = [
      { unit: "lovelace", quantity: "1500000" },
      {
        unit: issuance_mint.policy_id + stringToHex(assetName),
        quantity: this.quantity,
      },
    ];

    const programmableTokenDatum = conStr0([]);

    const txHex = await this.mesh
      .withdrawalPlutusScriptV3()
      .withdrawal(substandard_issue.address, "0")
      .withdrawalScript(substandard_issue._cbor)
      .withdrawalRedeemerValue(integer(100), "JSON")

      .mintPlutusScriptV3()
      .mint(this.quantity, issuance_mint.policy_id, stringToHex(assetName))
      .mintingScript(issuance_mint.cbor)
      .mintRedeemerValue(issuanceRedeemer, "JSON")

      .txOut(address, programmableTokenAssets)
      .txOutInlineDatumValue(programmableTokenDatum, "JSON")

      .txInCollateral(collateral.input.txHash, collateral.input.outputIndex)
      .selectUtxosFrom(utxos)
      .setNetwork("preview")
      .changeAddress(walletAddress)
      .complete();
    return txHex;
  };

  transferToken = async (
    unit: string,
    quantity: string,
    recipientAddress: string,
  ) => {
    const { utxos, walletAddress, collateral } =
      await this.getWalletInfoForTx();
    const policyId = unit.substring(0, POLICY_ID_LENGTH);
    const standardScript = new Cip113_scripts_standard(this.networkId);
    const substandardScript = new cip113_scripts_subStandard(this.networkId);
    const logic_base = await standardScript.programmable_logic_base(
      this.params,
    );
    const logic_global = await standardScript.programmable_logic_global(
      this.params,
    );
    const registry_spend = await standardScript.registry_spend(this.params);
    const substandard_transfer =
      await substandardScript.transfer_transfer_withdraw();
    const sender_credential = deserializeAddress(walletAddress)
      .asBase()
      ?.getPaymentCredential().hash;

    const recipient_credential = deserializeAddress(recipientAddress)
      .asBase()
      ?.getPaymentCredential().hash;

    const senderBaseAddress = buildBaseAddress(
      0,
      logic_base.policyId as Hash28ByteBase16,
      sender_credential!,
      CredentialType.ScriptHash,
      CredentialType.KeyHash,
    );
    const recipientBaseAddress = buildBaseAddress(
      0,
      logic_base.policyId as Hash28ByteBase16,
      recipient_credential!,
      CredentialType.ScriptHash,
      CredentialType.KeyHash,
    );
    const senderAddress = senderBaseAddress.toAddress().toBech32();
    const targetAddress = recipientBaseAddress.toAddress().toBech32();

    const registryUtxos = await this.fetcher?.fetchAddressUTxOs(
      registry_spend.address,
    );
    if (!registryUtxos) {
      throw new Error("Could not find registry entry for utxos");
    }

    const progTokenRegistry = registryUtxos?.find((utxo) => {
      const datum = deserializeDatum(utxo.output.plutusData!);
      const parsedDatum = parseRegistryDatum(datum);
      return parsedDatum?.key === policyId;
    });

    if (!progTokenRegistry) {
      throw new Error("Could not find registry entry for token");
    }

    const protocolParamsUtxos = await this.fetcher?.fetchUTxOs(
      this.params.txHash,
      0,
    );
    if (!protocolParamsUtxos) {
      throw new Error("Could not resolve protocol params");
    }
    const protocolParamsUtxo = protocolParamsUtxos[0];

    const senderProgTokenUtxos =
      await this.fetcher?.fetchAddressUTxOs(senderAddress);
    if (!senderProgTokenUtxos) {
      throw new Error("No programmable tokens found at sender address");
    }

    let totalTokenBalance = 0;
    senderProgTokenUtxos.forEach((utxo) => {
      const tokenAsset = utxo.output.amount.find((a) => a.unit === unit);
      if (tokenAsset) totalTokenBalance += Number(tokenAsset.quantity);
    });

    const transferAmount = Number(quantity);
    if (totalTokenBalance < transferAmount) throw new Error("Not enough funds");

    let selectedUtxos: UTxO[] = [];
    let selectedAmount = 0;
    for (const utxo of senderProgTokenUtxos) {
      if (selectedAmount >= transferAmount) break;
      const tokenAsset = utxo.output.amount.find((a) => a.unit === unit);
      if (tokenAsset) {
        selectedUtxos.push(utxo);
        selectedAmount += Number(tokenAsset.quantity);
      }
    }

    const returningAmount = selectedAmount - transferAmount;

    const registryProof = conStr0([integer(1)]);
    const programmableLogicGlobalRedeemer = conStr0([list([registryProof])]);
    const substandardTransferRedeemer = integer(200);
    const spendingRedeemer = conStr0([]);
    const tokenDatum = conStr0([]);

    const recipientAssets: Asset[] = [
      { unit: "lovelace", quantity: "1300000" },
      { unit: unit, quantity: transferAmount.toString() },
    ];

    const returningAssets: Asset[] = [
      { unit: "lovelace", quantity: "1300000" },
    ];
    if (returningAmount > 0) {
      returningAssets.push({
        unit: unit,
        quantity: returningAmount.toString(),
      });
    }
    const txHex = await this.mesh;

    for (const utxo of selectedUtxos) {
      txHex
        .spendingPlutusScriptV3()
        .txIn(utxo.input.txHash, utxo.input.outputIndex)
        .txInScript(logic_base.cbor)
        .txInRedeemerValue(spendingRedeemer, "JSON")
        .txInInlineDatumPresent();
    }

    txHex
      .withdrawalPlutusScriptV3()
      .withdrawal(substandard_transfer.reward_address, "0")
      .withdrawalScript(substandard_transfer._cbor)
      .withdrawalRedeemerValue(substandardTransferRedeemer, "JSON")

      .withdrawalPlutusScriptV3()
      .withdrawal(logic_global.reward_address, "0")
      .withdrawalScript(logic_global.cbor)
      .withdrawalRedeemerValue(programmableLogicGlobalRedeemer, "JSON")
      .requiredSignerHash(sender_credential!.toString())
      .txOut(walletAddress, [
        {
          unit: "lovelace",
          quantity: "1000000",
        },
      ]);

    if (returningAmount > 0) {
      txHex
        .txOut(senderAddress, returningAssets)
        .txOutInlineDatumValue(tokenDatum, "JSON");
    }

    txHex
      .txOut(targetAddress, recipientAssets)
      .txOutInlineDatumValue(tokenDatum, "JSON")

      .readOnlyTxInReference(
        protocolParamsUtxo.input.txHash,
        protocolParamsUtxo.input.outputIndex,
      )
      .readOnlyTxInReference(
        progTokenRegistry.input.txHash,
        progTokenRegistry.input.outputIndex,
      )

      .txInCollateral(collateral.input.txHash, collateral.input.outputIndex)
      .selectUtxosFrom(utxos)
      .setNetwork("preview")
      .changeAddress(walletAddress);

    const unsignedTx = await txHex.complete();
    return unsignedTx;
  };

  blacklistToken = async () => {};
}
