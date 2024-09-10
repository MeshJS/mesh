import {
  NativeScript,
  resolveNativeScriptHash,
  resolveNativeScriptHex,
  resolveScriptHashDRepId,
} from "@meshsdk/core";
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

    expect(txHex !== "").toBeTruthy();
  });

  it("Build tx to register DRep should succeed", () => {
    let mesh = new MeshTxBuilder();

    let txHex = mesh
      .changeAddress(
        "addr_test1qpsmz8q2xj43wg597pnpp0ffnlvr8fpfydff0wcsyzqyrxguk5v6wzdvfjyy8q5ysrh8wdxg9h0u4ncse4cxhd7qhqjqk8pse6",
      )
      .txIn(
        "2cb57168ee66b68bd04a0d595060b546edf30c04ae1031b883c9ac797967dd85",
        3,
        [
          {
            unit: "lovelace",
            quantity: "9891607895",
          },
        ],
        "addr_test1vru4e2un2tq50q4rv6qzk7t8w34gjdtw3y2uzuqxzj0ldrqqactxh",
      )
      .drepRegistrationCertificate(
        "drep1j6257gz2swty9ut46lspyvujkt02pd82am2zq97p7p9pv2euzs7",
        "500000000",
        {
          anchorUrl:
            "https://path-to.jsonld",
          anchorDataHash:
            "2aef51273a566e529a2d5958d981d7f0b3c7224fc2853b6c4922e019657b5060",
        },
      )
      .completeSync();

    expect(txHex !== "").toBeTruthy();
  });

  it("Build tx to register script DRep should succeed", () => {
    let mesh = new MeshTxBuilder();
    let script: NativeScript = {
      type: "all",
      scripts: [
        {
          type: "sig",
          keyHash: "61b11c0a34ab172285f06610bd299fd833a429235297bb1020804199",
        },
      ],
    };

    let drepId = resolveScriptHashDRepId(resolveNativeScriptHash(script));

    let txHex = mesh
      .changeAddress(
        "addr_test1qpsmz8q2xj43wg597pnpp0ffnlvr8fpfydff0wcsyzqyrxguk5v6wzdvfjyy8q5ysrh8wdxg9h0u4ncse4cxhd7qhqjqk8pse6",
      )
      .txIn(
        "2cb57168ee66b68bd04a0d595060b546edf30c04ae1031b883c9ac797967dd85",
        3,
        [
          {
            unit: "lovelace",
            quantity: "9891607895",
          },
        ],
        "addr_test1vru4e2un2tq50q4rv6qzk7t8w34gjdtw3y2uzuqxzj0ldrqqactxh",
      )
      .drepRegistrationCertificate(drepId, "500000000", {
        anchorUrl:
          "https://raw.githubusercontent.com/HinsonSIDAN/cardano-drep/main/HinsonSIDAN.jsonld",
        anchorDataHash:
          "2aef51273a566e529a2d5958d981d7f0b3c7224fc2853b6c4922e019657b5060",
      })
      .certificateScript(resolveNativeScriptHex(script))
      .completeSync();

    expect(txHex !== "").toBeTruthy();
  });

  it("Build tx to deregister script DRep should succeed", () => {
    let mesh = new MeshTxBuilder();
    let script: NativeScript = {
      type: "all",
      scripts: [
        {
          type: "sig",
          keyHash: "61b11c0a34ab172285f06610bd299fd833a429235297bb1020804199",
        },
      ],
    };

    let drepId = resolveScriptHashDRepId(resolveNativeScriptHash(script));

    let txHex = mesh
      .changeAddress(
        "addr_test1qpsmz8q2xj43wg597pnpp0ffnlvr8fpfydff0wcsyzqyrxguk5v6wzdvfjyy8q5ysrh8wdxg9h0u4ncse4cxhd7qhqjqk8pse6",
      )
      .txIn(
        "2cb57168ee66b68bd04a0d595060b546edf30c04ae1031b883c9ac797967dd85",
        3,
        [
          {
            unit: "lovelace",
            quantity: "9891607895",
          },
        ],
        "addr_test1vru4e2un2tq50q4rv6qzk7t8w34gjdtw3y2uzuqxzj0ldrqqactxh",
      )
      .drepDeregistrationCertificate(drepId, "500000000")
      .certificateScript(resolveNativeScriptHex(script))
      .completeSync();

    console.log(txHex);
    expect(txHex !== "").toBeTruthy();
  });
});
