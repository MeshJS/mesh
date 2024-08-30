import { MeshTxBuilder } from "@meshsdk/transaction";

describe("MeshTxBuilder transactions", () => {
  it("Adding embedded datum should produce correct tx cbor", () => {
    let mesh = new MeshTxBuilder({ verbose: true });

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

    expect(txHex).toBe("84a400818258202cb57168ee66b68bd04a0d595060b546edf30c04ae1031b883c9ac797967dd8503018283581d60f95cab9352c14782a366802b7967746a89356e8915c17006149ff68c1a001e84805820923918e403bf43c34b4ef6b48eb2ee04babed17320d8d1b9ff9ad086e86f44ec82581d60f95cab9352c14782a366802b7967746a89356e8915c17006149ff68c1b000000024d74dc6e021a000294690b582015dd0a3ac1244430aacc7e95c2734b51f1a8cf2aaf05e5d6e8124cb78ab54cc9a1049fd87980fff5f6");
  });
});
