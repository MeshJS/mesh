import {
  MeshTxBuilder,
  NativeScript,
  resolveNativeScriptHex,
} from "@meshsdk/core";
import { Transaction, TxCBOR } from "@meshsdk/core-cst";

import { alwaysSucceedCbor } from "../test-util";

describe("MeshTxBuilder Script Metadata", () => {
  it("should create a transaction with plutusV3 metadata", async () => {
    const txBuilder = new MeshTxBuilder();

    let txHex = txBuilder
      .txIn(
        "2cb57168ee66b68bd04a0d595060b546edf30c04ae1031b883c9ac797967dd85",
        3,
        [{ unit: "lovelace", quantity: "9891607895" }],
        "addr_test1vru4e2un2tq50q4rv6qzk7t8w34gjdtw3y2uzuqxzj0ldrqqactxh",
      )
      .txOut(
        "addr_test1vru4e2un2tq50q4rv6qzk7t8w34gjdtw3y2uzuqxzj0ldrqqactxh",
        [{ unit: "lovelace", quantity: "2000000" }],
      )
      .changeAddress(
        "addr_test1vru4e2un2tq50q4rv6qzk7t8w34gjdtw3y2uzuqxzj0ldrqqactxh",
      )
      .metadataScript(alwaysSucceedCbor, "PlutusV3")
      .completeSync();

    const cardanoTx = Transaction.fromCbor(TxCBOR(txHex));
    expect(cardanoTx.auxiliaryData()?.plutusV3Scripts).toBeDefined();
  });

  it("should create a transaction with native script metadata", async () => {
    const txBuilder = new MeshTxBuilder();
    const nativeScript: NativeScript = {
      type: "all",
      scripts: [],
    };
    let txHex = txBuilder
      .txIn(
        "2cb57168ee66b68bd04a0d595060b546edf30c04ae1031b883c9ac797967dd85",
        3,
        [{ unit: "lovelace", quantity: "9891607895" }],
        "addr_test1vru4e2un2tq50q4rv6qzk7t8w34gjdtw3y2uzuqxzj0ldrqqactxh",
      )
      .txOut(
        "addr_test1vru4e2un2tq50q4rv6qzk7t8w34gjdtw3y2uzuqxzj0ldrqqactxh",
        [{ unit: "lovelace", quantity: "2000000" }],
      )
      .changeAddress(
        "addr_test1vru4e2un2tq50q4rv6qzk7t8w34gjdtw3y2uzuqxzj0ldrqqactxh",
      )
      .metadataScript(resolveNativeScriptHex(nativeScript), "Native")
      .completeSync();

    const cardanoTx = Transaction.fromCbor(TxCBOR(txHex));
    expect(cardanoTx.auxiliaryData()?.nativeScripts).toBeDefined();
  });
});
