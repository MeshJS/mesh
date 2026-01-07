import {
    byteString,
    conStr,
    conStr1,
    integer,
    PlutusScript,
    scriptHash,
    TxInput,
  } from "@meshsdk/common";
  import {
    applyParamsToScript,
    resolveScriptHash,
    serializePlutusScript,
  } from "@meshsdk/core";
  import {
    scriptHashToRewardAddress,
  } from "@meshsdk/core-cst";
  
  import { ProtocolBootstrapParams } from "./types";
  import { findValidator } from "./utils";
  
  export class Cip113_scripts_standard {
    private networkID: number;
    constructor(networkID: number) {
      this.networkID = networkID;
    }
    async blacklist_mint(utxo_reference: TxInput, manager_pubkey_hash: string) {
      const validator = findValidator("blacklist_mint", "mint");
      const cbor = applyParamsToScript(
        validator,
        [conStr(0, [byteString(utxo_reference.txHash), integer(utxo_reference.outputIndex)]),
         byteString(manager_pubkey_hash)],
        "JSON",
      );
      const plutus_script: PlutusScript = {
        code: cbor,
        version: "V3",
      };
      const policy_id = resolveScriptHash(cbor, "V3");
  
      return { cbor, plutus_script, policy_id };
    }
  
    async issuance_mint(
      params: ProtocolBootstrapParams,
      minting_logic_credential: string,
    ) {
      const validator = findValidator("issuance_mint", "mint");
      const cbor = applyParamsToScript(
        validator,
        [
          conStr1([byteString(params.programmableLogicBaseParams.scriptHash)]),
          conStr1([byteString(minting_logic_credential)]),
        ],
        "JSON",
      );
      const plutus_script: PlutusScript = {
        code: cbor,
        version: "V3",
      };
      const policy_id = resolveScriptHash(cbor, "V3");
      return { cbor, plutus_script, policy_id };
    }
  
    async issuance_cbor_hex_mint(utxo_reference: TxInput) {
      const validator = findValidator("issuance_cbor_hex_mint", "mint");
      const cbor = applyParamsToScript(
        validator,
        [conStr(0, [byteString(utxo_reference.txHash), integer(utxo_reference.outputIndex)])],
        "JSON",
      );
      const plutus_script: PlutusScript = {
        code: cbor,
        version: "V3",
      };
      const policy_id = resolveScriptHash(cbor, "V3");
      return { cbor, plutus_script, policy_id };
    }
  
    async programmable_logic_base(
      params: ProtocolBootstrapParams,
    ) {
      const validator = findValidator("programmable_logic_base", "spend");
      const cbor = applyParamsToScript(
        validator,
        [conStr1([byteString(params.programmableLogicGlobalPrams.scriptHash)])],
        "JSON",
      );
      const plutus_script: PlutusScript = {
        code: cbor,
        version: "V3",
      };
      const policyId = resolveScriptHash(cbor, "V3");
      return {
        cbor,
        plutus_script,
        policyId,
      };
    }
  
    async programmable_logic_global(params: ProtocolBootstrapParams) {
      const validator = findValidator("programmable_logic_global", "withdraw");
      const cbor = applyParamsToScript(
        validator,
        [scriptHash(params.protocolParams.scriptHash)],
        "JSON",
      );
      const script_hash = resolveScriptHash(cbor, "V3");
      const reward_address = scriptHashToRewardAddress(script_hash, this.networkID);
      const plutus_script: PlutusScript = {
        code: cbor,
        version: "V3",
      };
  
      return { cbor, plutus_script, reward_address, script_hash };
    }
  
    async protocol_param_mint(utxo_reference: TxInput) {
      const validator = findValidator("protocol_param_mint", "mint");
      const cbor = applyParamsToScript(
        validator,
        [conStr(0, [byteString(utxo_reference.txHash), integer(utxo_reference.outputIndex)])],
        "JSON",
      );
      const plutus_script: PlutusScript = {
        code: cbor,
        version: "V3",
      };
      const script_hash = resolveScriptHash(cbor, "V3");
      return { cbor, plutus_script, script_hash };
    }
  
    async registry_mint(params: ProtocolBootstrapParams) {
      const parameter = params.directoryMintParams.txInput;
      const validator = findValidator("registry_mint", "mint");
      const cbor = applyParamsToScript(
        validator,
        [
          conStr(0, [
            byteString(parameter.txHash),
            integer(parameter.outputIndex),
          ]),
          scriptHash(params.directoryMintParams.issuanceScriptHash),
        ],
        "JSON",
      );
      const plutus_script: PlutusScript = {
        code: cbor,
        version: "V3",
      };
      const policy_id = resolveScriptHash(cbor, "V3");
      return { cbor, plutus_script, policy_id };
    }
  
    async registry_spend(params: ProtocolBootstrapParams) {
      const validator = findValidator("registry_spend", "spend");
      const cbor = applyParamsToScript(
        validator,
        [scriptHash(params.protocolParams.scriptHash)],
        "JSON",
      );
      const plutus_script: PlutusScript = {
        code: cbor,
        version: "V3",
      };
      const address = serializePlutusScript(
        plutus_script,
        "",
        this.networkID,
        false,
      ).address;
      const policy_id = resolveScriptHash(cbor, "V3");
      return {
        cbor,
        plutus_script,
        address,
        policy_id,
      };
    }
  
    async example_transfer_logic(permitted_credential: string) {
      const validator = findValidator("example_transfer_logic", "withdraw");
      const cbor = applyParamsToScript(
        validator,
        [scriptHash(permitted_credential)],
        "JSON",
      );
      const plutus_script: PlutusScript = {
        code: cbor,
        version: "V3",
      };
      const address = serializePlutusScript(
        plutus_script,
        permitted_credential,
        this.networkID,
        true,
      ).address;
      return { cbor, plutus_script, address };
    }
  }
  