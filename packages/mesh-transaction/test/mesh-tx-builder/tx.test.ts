import { resolveNativeScriptHash, resolveNativeScriptHex } from "@meshsdk/core";
import { MeshTxBuilder } from "@meshsdk/transaction";

describe("MeshTxBuilder transactions", () => {
  it("Adding embedded datum should produce correct tx cbor", () => {
    let mesh = new MeshTxBuilder();

    let txHex = mesh
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
      .txOutDatumEmbedValue(
        {
          constructor: 0,
          fields: [],
        },
        "JSON",
      )
      .changeAddress(
        "addr_test1vru4e2un2tq50q4rv6qzk7t8w34gjdtw3y2uzuqxzj0ldrqqactxh",
      )
      .completeSync();

    expect(txHex !== "").toBeTruthy();
  });

  it("Build tx of spending native script should succeed", () => {
    let mesh = new MeshTxBuilder();

    let txHex = mesh
      .txIn(
        "2cb57168ee66b68bd04a0d595060b546edf30c04ae1031b883c9ac797967dd85",
        3,
        [{ unit: "lovelace", quantity: "9891607895" }],
        "addr_test1vru4e2un2tq50q4rv6qzk7t8w34gjdtw3y2uzuqxzj0ldrqqactxh",
      )
      .txInScript(
        resolveNativeScriptHex({
          type: "all",
          scripts: [
            {
              type: "after",
              slot: "1",
            },
          ],
        }),
      )
      .txOut(
        "addr_test1vru4e2un2tq50q4rv6qzk7t8w34gjdtw3y2uzuqxzj0ldrqqactxh",
        [{ unit: "lovelace", quantity: "2000000" }],
      )
      .changeAddress(
        "addr_test1vru4e2un2tq50q4rv6qzk7t8w34gjdtw3y2uzuqxzj0ldrqqactxh",
      )
      .setNetwork("preprod")
      .completeSync();

    console.log(txHex);
    expect(txHex !== "").toBeTruthy();
  });

  it("Build tx of spending native script with ref should succeed", () => {
    let mesh = new MeshTxBuilder();

    let txHex = mesh
      .txIn(
        "2cb57168ee66b68bd04a0d595060b546edf30c04ae1031b883c9ac797967dd85",
        3,
        [{ unit: "lovelace", quantity: "9891607895" }],
        "addr_test1vru4e2un2tq50q4rv6qzk7t8w34gjdtw3y2uzuqxzj0ldrqqactxh",
      )
      .simpleScriptTxInReference(
        "2cb57168ee66b68bd04a0d595060b546edf30c04ae1031b883c9ac797967dd85",
        1,
        resolveNativeScriptHash({
          type: "all",
          scripts: [
            {
              type: "after",
              slot: "1",
            },
          ],
        }),
        "1000",
      )
      .txOut(
        "addr_test1vru4e2un2tq50q4rv6qzk7t8w34gjdtw3y2uzuqxzj0ldrqqactxh",
        [{ unit: "lovelace", quantity: "2000000" }],
      )
      .changeAddress(
        "addr_test1vru4e2un2tq50q4rv6qzk7t8w34gjdtw3y2uzuqxzj0ldrqqactxh",
      )
      .setNetwork("preprod")
      .completeSync();

    console.log(txHex);
    expect(txHex !== "").toBeTruthy();
  });
});
