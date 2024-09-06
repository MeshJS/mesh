import { builtinByteString, list, PlutusScript } from "@meshsdk/common";
import {
  BrowserWallet,
  deserializeAddress,
  MeshWallet,
  Transaction,
} from "@meshsdk/core";
import { applyParamsToScript } from "@meshsdk/core-csl";

import { MeshTxInitiator, MeshTxInitiatorInput } from "../common";
import blueprintV1 from "./aiken-workspace-v1/plutus.json";
import blueprintV2 from "./aiken-workspace-v2/plutus.json";

export class MeshPaymentSplitterContract extends MeshTxInitiator {
  scriptCbor: string;
  scriptAddress: string;
  payees: string[] = [];

  wrapPayees = (payees: string[]) =>
    list(
      payees.map((payee) =>
        builtinByteString(deserializeAddress(payee).pubKeyHash),
      ),
    );

  constructor(inputs: MeshTxInitiatorInput, payees: string[]) {
    super(inputs);

    if (inputs.wallet) {
      // We add the initiator to the payees list, as only the payees can trigger the payout in the next steps
      if (inputs.wallet instanceof MeshWallet) {
        this.payees = [inputs.wallet.getUsedAddresses()[0]!, ...payees];
      }
      if (inputs.wallet instanceof BrowserWallet) {
        inputs.wallet.getUsedAddresses().then((addresses) => {
          this.payees = [addresses[0]!, ...payees];
        });
      }
    } else {
      this.payees = payees;
      console.warn(
        "Wallet not provided. Therefore the payment address will not be added to the payees list which makes it impossible to trigger the payout.",
      );
    }

    this.scriptCbor = this.getScriptCbor();
    this.scriptAddress = this.getScriptAddress(this.scriptCbor);
  }

  getScriptCbor = () => {
    switch (this.version) {
      case 2:
        return applyParamsToScript(
          blueprintV2.validators[0]!.compiledCode,
          [this.wrapPayees(this.payees)],
          "JSON",
        );

      default:
        return applyParamsToScript(
          blueprintV1.validators[0]!.compiledCode,
          [this.wrapPayees(this.payees)],
          "JSON",
        );
    }
  };

  sendLovelaceToSplitter = async (lovelaceAmount: number): Promise<string> => {
    if (this.wallet === null || this.wallet === undefined) {
      throw new Error("Wallet not provided");
    }

    const { walletAddress } = await this.getWalletInfoForTx();

    const { pubKeyHash } = deserializeAddress(walletAddress);
    const datum = {
      alternative: 0,
      fields: [pubKeyHash],
    };

    const tx = new Transaction({ initiator: this.wallet }).sendLovelace(
      {
        address: this.scriptAddress,
        datum: { value: datum },
      },
      lovelaceAmount.toString(),
    );

    const unsignedTx = await tx.build();
    return unsignedTx;
  };

  triggerPayout = async () => {
    if (this.wallet === null || this.wallet === undefined) {
      throw new Error("Wallet not provided");
    }

    const { walletAddress, collateral } = await this.getWalletInfoForTx();

    const script: PlutusScript = {
      code: this.scriptCbor,
      version: this.languageVersion,
    };

    const utxos =
      (await this.fetcher?.fetchAddressUTxOs(this.scriptAddress)) || [];
    const { pubKeyHash } = deserializeAddress(walletAddress);
    const datum = {
      alternative: 0,
      fields: [pubKeyHash],
    };

    const redeemerData = "Hello, World!";
    const redeemer = { data: { alternative: 0, fields: [redeemerData] } };

    let tx = new Transaction({ initiator: this.wallet });
    let split = 0;
    for (const utxo of utxos) {
      const amount = utxo.output?.amount;
      if (amount) {
        let lovelace = amount.find((asset) => asset.unit === "lovelace");
        if (lovelace) {
          split += Math.floor(Number(lovelace.quantity) / this.payees.length);
        }

        tx = tx.redeemValue({
          value: utxo,
          script: script,
          datum: datum,
          redeemer: redeemer,
        });
      }
    }

    tx = tx.setCollateral([collateral]);
    for (const payee of this.payees) {
      tx = tx.sendLovelace(payee, split.toString());
    }

    tx = tx.setRequiredSigners([walletAddress]);
    const unsignedTx = await tx.build();
    return unsignedTx;
  };
}
