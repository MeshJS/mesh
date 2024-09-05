import { builtinByteString, list, PlutusScript } from "@meshsdk/common";
import {
  BrowserWallet,
  deserializeAddress,
  MeshWallet,
  serializePlutusScript,
  Transaction,
} from "@meshsdk/core";
import { applyParamsToScript } from "@meshsdk/core-csl";

import { MeshTxInitiator, MeshTxInitiatorInput } from "../common";
import blueprint from "./aiken-workspace/plutus.json";

export const MeshPaymentSplitterBlueprint = blueprint;

export class MeshPaymentSplitterContract extends MeshTxInitiator {
  wrapPayees = (payees: string[]) =>
    list(
      payees.map((payee) =>
        builtinByteString(deserializeAddress(payee).pubKeyHash),
      ),
    );

  scriptCbor = () =>
    applyParamsToScript(
      blueprint.validators[0]!.compiledCode,
      [this.wrapPayees(this.payees)],
      "JSON",
    );
  payees: string[] = [];

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
  }

  sendLovelaceToSplitter = async (lovelaceAmount: number): Promise<string> => {
    if (this.wallet === null || this.wallet === undefined) {
      throw new Error("Wallet not provided");
    }

    const { walletAddress } = await this.getWalletInfoForTx();

    const script: PlutusScript = {
      code: this.scriptCbor(),
      version: "V2",
    };

    const { address: scriptAddress } = serializePlutusScript(
      script,
      undefined,
      this.networkId,
    );

    const { pubKeyHash } = deserializeAddress(walletAddress);
    const datum = {
      alternative: 0,
      fields: [pubKeyHash],
    };

    const tx = new Transaction({ initiator: this.wallet }).sendLovelace(
      {
        address: scriptAddress,
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
      code: this.scriptCbor(),
      version: "V2",
    };
    const { address: scriptAddress } = serializePlutusScript(
      script,
      undefined,
      this.networkId,
    );
    const utxos = (await this.fetcher?.fetchAddressUTxOs(scriptAddress)) || [];
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
