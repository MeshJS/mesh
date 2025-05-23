import {
  applyCborEncoding,
  BlockfrostProvider,
  DEFAULT_REDEEMER_BUDGET,
  mConStr0,
  NativeScript,
  OfflineFetcher,
  resolveNativeScriptHash,
  resolveNativeScriptHex,
  resolveScriptHash,
  resolveScriptHashDRepId,
} from "@meshsdk/core";
import { OfflineEvaluator } from "@meshsdk/core-csl";
import { resolvePlutusScriptAddress, Serialization } from "@meshsdk/core-cst";
import { MeshTxBuilder } from "@meshsdk/transaction";

describe("MeshTxBuilder transactions", () => {
  it("Basic send tx", () => {
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
      .changeAddress(
        "addr_test1vru4e2un2tq50q4rv6qzk7t8w34gjdtw3y2uzuqxzj0ldrqqactxh",
      )
      .completeSync();

    expect(txHex !== "").toBeTruthy();
  });

  it("Basic send tx with set fee", () => {
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
      .changeAddress(
        "addr_test1vru4e2un2tq50q4rv6qzk7t8w34gjdtw3y2uzuqxzj0ldrqqactxh",
      )
      .setFee("5000000")
      .completeSync();
    const cardanoTx = Serialization.Transaction.fromCbor(
      Serialization.TxCBOR(txHex),
    );
    expect(cardanoTx.body().fee().toString()).toBe("5000000");
    expect(txHex !== "").toBeTruthy();
  });

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
        {
          anchorUrl: "https://path-to.jsonld",
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
      .drepRegistrationCertificate(drepId, {
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

  it("Build tx to register script stake should succeed", () => {
    let mesh = new MeshTxBuilder();

    let txHex = mesh
      .txIn(
        "40d48affc2e9648c4e40b2dad65b24185357c07d140045d98b28bb60714e9d4a",
        0,
        [
          {
            unit: "lovelace",
            quantity: "554843556",
          },
        ],
        "addr_test1qr3a9rrclgf9rx90lmll2qnfzfwgrw35ukvgjrk36pmlzu0jemqwylc286744g0tnqkrvu0dkl8r48k0upkfmg7mncpqf0672w",
      )
      .registerStakeCertificate(
        "stake_test17ryje2rawy9d7m2fwn4nrxgch8st3anccre32g885gu232snvhvu7",
      )
      .changeAddress(
        "addr_test1qr3a9rrclgf9rx90lmll2qnfzfwgrw35ukvgjrk36pmlzu0jemqwylc286744g0tnqkrvu0dkl8r48k0upkfmg7mncpqf0672w",
      )
      .setNetwork("preprod")
      .completeSync();

    console.log(txHex);
  });

  it("Build tx to withdraw from script stake should succeed", () => {
    let mesh = new MeshTxBuilder();
    let scriptCbor =
      "58ff58fd01010033232323232322322533300432323232323232533300b3370e9002001099198011bac301030113011301130113011301130113011300e375400e014601e601a6ea800c54ccc02ccdc3a400c0042646464660086eb0c048c04cc04cc04cc04cc04cc04cc04cc04cc040dd5004806180898090011bad3010001300d37540062c44646600200200644a66602200229404c94ccc03ccdc79bae301300200414a2266006006002602600260146ea8004c030c034008c02c004c02c008c024004c018dd50008a4c26cac6eb80055cd2ab9d5573caae7d5d0aba24c011e581ce3d28c78fa125198affefff50269125c81ba34e598890ed1d077f1710001";

    let txHex = mesh
      .txIn(
        "f5be282d696cc5ca269d18de02224c3717aabc01ab2b76002860a110e108016a",
        0,
        [
          {
            unit: "lovelace",
            quantity: "554042851",
          },
        ],
        "addr_test1qr3a9rrclgf9rx90lmll2qnfzfwgrw35ukvgjrk36pmlzu0jemqwylc286744g0tnqkrvu0dkl8r48k0upkfmg7mncpqf0672w",
      )
      .txInCollateral(
        "80fff8d27e8dffec05ac773f22140cf86d8e30a0243e7df6849b74633d79e007",
        5,
        [
          {
            unit: "lovelace",
            quantity: "5000000",
          },
        ],
        "addr_test1qr3a9rrclgf9rx90lmll2qnfzfwgrw35ukvgjrk36pmlzu0jemqwylc286744g0tnqkrvu0dkl8r48k0upkfmg7mncpqf0672w",
      )
      .withdrawalPlutusScriptV3()
      .withdrawal(
        "stake_test17zfe24q7scqldhc6csp5uf2yr4z5gtv5vq4ex394g7ve36q8j32jn",
        "0",
      )
      .withdrawalScript(scriptCbor)
      .withdrawalRedeemerValue(mConStr0([]), "Mesh", DEFAULT_REDEEMER_BUDGET)
      .requiredSignerHash(
        "e3d28c78fa125198affefff50269125c81ba34e598890ed1d077f171",
      )
      .changeAddress(
        "addr_test1qr3a9rrclgf9rx90lmll2qnfzfwgrw35ukvgjrk36pmlzu0jemqwylc286744g0tnqkrvu0dkl8r48k0upkfmg7mncpqf0672w",
      )
      .setNetwork("preprod")
      .completeSync();

    console.log(txHex);
  });

  it("Build tx to delegate vote should succeed", () => {
    let mesh = new MeshTxBuilder();

    let txHex = mesh
      .txIn(
        "f5be282d696cc5ca269d18de02224c3717aabc01ab2b76002860a110e108016a",
        0,
        [
          {
            unit: "lovelace",
            quantity: "554042851",
          },
        ],
        "addr_test1qr3a9rrclgf9rx90lmll2qnfzfwgrw35ukvgjrk36pmlzu0jemqwylc286744g0tnqkrvu0dkl8r48k0upkfmg7mncpqf0672w",
      )
      .voteDelegationCertificate(
        {
          dRepId: "drep1j6257gz2swty9ut46lspyvujkt02pd82am2zq97p7p9pv2euzs7",
        },
        "stake_test1uzdx8vwxvz5wy45fwdrwk2l85ax7j5wtr4cee6a8xc632cc3p6psh",
      )
      .changeAddress(
        "addr_test1qr3a9rrclgf9rx90lmll2qnfzfwgrw35ukvgjrk36pmlzu0jemqwylc286744g0tnqkrvu0dkl8r48k0upkfmg7mncpqf0672w",
      )
      .setNetwork("preprod")
      .completeSync();

    console.log(txHex);
  });

  it("Build tx to update DRep should succeed", () => {
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
      .drepUpdateCertificate(
        "drep1j6257gz2swty9ut46lspyvujkt02pd82am2zq97p7p9pv2euzs7",
        {
          anchorUrl: "https://path-to.jsonld",
          anchorDataHash:
            "2aef51273a566e529a2d5958d981d7f0b3c7224fc2853b6c4922e019657b5060",
        },
      )
      .completeSync();
    console.log(txHex);
    expect(txHex !== "").toBeTruthy();
  });

  it("Drep vote", () => {
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
      .vote(
        {
          type: "DRep",
          drepId: "drep1j6257gz2swty9ut46lspyvujkt02pd82am2zq97p7p9pv2euzs7",
        },
        {
          txHash:
            "2cb57168ee66b68bd04a0d595060b546edf30c04ae1031b883c9ac797967dd85",
          txIndex: 3,
        },
        {
          voteKind: "Yes",
          anchor: {
            anchorUrl: "https://path-to.jsonld",
            anchorDataHash:
              "2aef51273a566e529a2d5958d981d7f0b3c7224fc2853b6c4922e019657b5060",
          },
        },
      )
      .completeSync();

    console.log(txHex);
    expect(txHex !== "").toBeTruthy();
  });

  it("Script drep vote", () => {
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
      .txInCollateral(
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
      .votePlutusScriptV3()
      .vote(
        {
          type: "DRep",
          drepId: resolveScriptHashDRepId(
            resolveScriptHash(
              applyCborEncoding(
                "5834010100323232322533300232323232324a260106012004600e002600e004600a00260066ea8004526136565734aae795d0aba201",
              ),
              "V3",
            ),
          ),
        },
        {
          txHash:
            "2cb57168ee66b68bd04a0d595060b546edf30c04ae1031b883c9ac797967dd85",
          txIndex: 3,
        },
        {
          voteKind: "Yes",
          anchor: {
            anchorUrl: "https://path-to.jsonld",
            anchorDataHash:
              "2aef51273a566e529a2d5958d981d7f0b3c7224fc2853b6c4922e019657b5060",
          },
        },
      )
      .voteScript(
        applyCborEncoding(
          "5834010100323232322533300232323232324a260106012004600e002600e004600a00260066ea8004526136565734aae795d0aba201",
        ),
      )
      .voteRedeemerValue("")
      .completeSync();

    console.log(txHex);
    expect(txHex !== "").toBeTruthy();
  });

  it("CC vote", () => {
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
      .vote(
        {
          type: "ConstitutionalCommittee",
          hotCred: {
            type: "KeyHash",
            keyHash: "e3a4c41d67592a1b8d87c62e5c5d73f7e8db836171945412d13f40f8",
          },
        },
        {
          txHash:
            "2cb57168ee66b68bd04a0d595060b546edf30c04ae1031b883c9ac797967dd85",
          txIndex: 3,
        },
        {
          voteKind: "Yes",
          anchor: {
            anchorUrl: "https://path-to.jsonld",
            anchorDataHash:
              "2aef51273a566e529a2d5958d981d7f0b3c7224fc2853b6c4922e019657b5060",
          },
        },
      )
      .completeSync();

    console.log(txHex);
    expect(txHex !== "").toBeTruthy();
  });

  it("Custom cost models", () => {
    let mesh = new MeshTxBuilder();

    let txHex = mesh
      .spendingPlutusScriptV3()
      .txIn(
        "fc1c806abc9981f4bee2ce259f61578c3341012f3d04f22e82e7e40c7e7e3c3c",
        0,
        [
          {
            unit: "lovelace",
            quantity: "9692479606",
          },
        ],
        resolvePlutusScriptAddress(
          {
            code: "58365834010100323232322533300232323232324a260106012004600e002600e004600a00260066ea8004526136565734aae795d0aba201",
            version: "V3",
          },
          0,
        ),
      )
      .txInScript(
        "58365834010100323232322533300232323232324a260106012004600e002600e004600a00260066ea8004526136565734aae795d0aba201",
      )
      .txInDatumValue(mConStr0([]))
      .txInRedeemerValue(mConStr0([]), "Mesh", { mem: 100000, steps: 1000000 })
      .setNetwork([[1], [1], [1]])
      .changeAddress(
        "addr_test1qpsmz8q2xj43wg597pnpp0ffnlvr8fpfydff0wcsyzqyrxguk5v6wzdvfjyy8q5ysrh8wdxg9h0u4ncse4cxhd7qhqjqk8pse6",
      )
      .txInCollateral(
        "3fbdf2b0b4213855dd9b87f7c94a50cf352ba6edfdded85ecb22cf9ceb75f814",
        7,
        [
          {
            unit: "lovelace",
            quantity: "10000000",
          },
        ],
        "addr_test1vpw22xesfv0hnkfw4k5vtrz386tfgkxu6f7wfadug7prl7s6gt89x",
      )
      .completeSync();

    console.log(txHex);
    expect(txHex !== "").toBeTruthy();
  });

  it("balance test", () => {
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
        [],
      )
      .changeAddress(
        "addr_test1vru4e2un2tq50q4rv6qzk7t8w34gjdtw3y2uzuqxzj0ldrqqactxh",
      )
      .completeSync();

    expect(txHex !== "").toBeTruthy();
  });

  it("byron output test", () => {
    let mesh = new MeshTxBuilder();
    let txHex = mesh
      .txIn(
        "2cb57168ee66b68bd04a0d595060b546edf30c04ae1031b883c9ac797967dd85",
        3,
        [{ unit: "lovelace", quantity: "9891607895" }],
        "addr_test1vru4e2un2tq50q4rv6qzk7t8w34gjdtw3y2uzuqxzj0ldrqqactxh",
      )
      .txOut(
        "DdzFFzCqrhswh7xiYG8RE1TtcvWamhbExTXfsCYaF9PrGWHRLCwCsBH5JkeApUagvo4FZE3DJD3rn5hw8vaMBib2StKMJ77rJHt51jPt",
        [{ unit: "lovelace", quantity: "2000000" }],
      )
      .changeAddress(
        "addr_test1vru4e2un2tq50q4rv6qzk7t8w34gjdtw3y2uzuqxzj0ldrqqactxh",
      )
      .completeSync();

    expect(txHex !== "").toBeTruthy();
  });

  it("byron change output test", () => {
    let mesh = new MeshTxBuilder();
    let txHex = mesh
      .txIn(
        "2cb57168ee66b68bd04a0d595060b546edf30c04ae1031b883c9ac797967dd85",
        3,
        [{ unit: "lovelace", quantity: "9891607895" }],
        "addr_test1vru4e2un2tq50q4rv6qzk7t8w34gjdtw3y2uzuqxzj0ldrqqactxh",
      )
      .txOut(
        "DdzFFzCqrhswh7xiYG8RE1TtcvWamhbExTXfsCYaF9PrGWHRLCwCsBH5JkeApUagvo4FZE3DJD3rn5hw8vaMBib2StKMJ77rJHt51jPt",
        [{ unit: "lovelace", quantity: "2000000" }],
      )
      .changeAddress(
        "DdzFFzCqrhswh7xiYG8RE1TtcvWamhbExTXfsCYaF9PrGWHRLCwCsBH5JkeApUagvo4FZE3DJD3rn5hw8vaMBib2StKMJ77rJHt51jPt",
      )
      .completeSync();

    expect(txHex !== "").toBeTruthy();
  });

  it("test", async () => {
    let mesh = new MeshTxBuilder();
    const txHex = await mesh.complete({
      inputs: [
        {
          type: "PubKey",
          txIn: {
            txHash:
              "99acc8beeed1d17c3823ed683eb1ae92372b6301b165c622ea5ee7c93a61654a",
            txIndex: 0,
            amount: [{ unit: "lovelace", quantity: "100000000" }],
            address:
              "addr_test1qpgzv6fytsl7fg4htxkvrlhq83ytmx6wryh0rzrmvs9asqrvawkzn6eqgpekwadfakznxj70tzepz54g0ppfqyuzefnq7lcxng",
            scriptSize: 0,
          },
        },
      ],
      outputs: [
        {
          address:
            "addr_test1wql6cyymfrmqe9cjeyfh5d4h945nfszy3yup8d74kkrhsks4dkk0y",
          amount: [{ unit: "lovelace", quantity: "3000000" }],
          datum: {
            type: "Inline",
            data: {
              type: "JSON",
              content: `{"constructor":0,"fields":[{"bytes":"547261646546756e644944313233"},{"constructor":0,"fields":[{"constructor":0,"fields":[{"bytes":"502669245c3fe4a2b759acc1fee03c48bd9b4e192ef1887b640bd800"}]},{"constructor":0,"fields":[{"constructor":0,"fields":[{"constructor":0,"fields":[{"bytes":"6cebac29eb2040736775a9ed85334bcf58b21152a87842901382ca66"}]}]}]}]},{"map":[{"k":{"bytes":""},"v":{"map":[{"k":{"bytes":""},"v":{"int":3000000}}]}}]}]}`,
            },
          },
        },
      ],
      collaterals: [
        {
          type: "PubKey",
          txIn: {
            txHash:
              "31fd8553fb1d1328e98ab267960974e9bd42be901e2b889182934ae396f7bd4e",
            txIndex: 0,
            amount: [{ unit: "lovelace", quantity: "5000000" }],
            address:
              "addr_test1qpgzv6fytsl7fg4htxkvrlhq83ytmx6wryh0rzrmvs9asqrvawkzn6eqgpekwadfakznxj70tzepz54g0ppfqyuzefnq7lcxng",
            scriptSize: 0,
          },
        },
      ],
      requiredSignatures: [],
      referenceInputs: [
        {
          txHash:
            "96c998f4b5caa72b20e4f6be3b3996548bff0e9a7dc298a33c8f939014bc4567",
          txIndex: 0,
        },
      ],
      mints: [],
      changeAddress:
        "addr_test1qpgzv6fytsl7fg4htxkvrlhq83ytmx6wryh0rzrmvs9asqrvawkzn6eqgpekwadfakznxj70tzepz54g0ppfqyuzefnq7lcxng",
      metadata: new Map(),
      validityRange: {},
      certificates: [],
      withdrawals: [],
      votes: [],
      signingKey: [],
      chainedTxs: [],
      inputsForEvaluation: {},
      network: "preprod",
      fee: "300000",
    });

    const cardanoTx = Serialization.Transaction.fromCbor(
      Serialization.TxCBOR(txHex),
    );
    expect(cardanoTx.body().fee().toString()).toBe("300000");
  });

  it("test eval redeemer indexes", async () => {
    const extraInputs = [
      {
        input: {
          outputIndex: 2,
          txHash:
            "1e193d6cddee6bd4e001d29b4f84e597fd2b79f215fa7d44f6879157ff380013",
        },
        output: {
          address:
            "addr_test1qzhm3fg7v9t9e4nrlw0z49cysmvzfy3xpmvxuht80aa3rvnm5tz7rfnph9ntszp2fclw5m334udzq49777gkhwkztsks4c69rg",
          amount: [
            {
              unit: "lovelace",
              quantity: "4305636795",
            },
            {
              unit: "46bb20d80ebce0a0a1b0463bc19be3a7cd93e92cb4487b4f9f3e7db36f7261636c65",
              quantity: "1",
            },
            {
              unit: "a859a58979d49c7cfa4ddee50a86bb410c7da87555fab1df34285900000de1404964656e74697479546f6b656e30",
              quantity: "1",
            },
            {
              unit: "c8e80005a539fb4b0524025d493635b3ef3b32712916e1a5b3aa26b0000de140afb8a51e61565cd663fb9e2a970486d82492260ed86e5d677f7b11b2",
              quantity: "1",
            },
            {
              unit: "dfce8854717946c4036d9974dadbf9c522a5df24ff5e98173c984bca000643b0afb8a51e61565cd663fb9e2a970486d82492260ed86e5d677f7b11b2",
              quantity: "1",
            },
            {
              unit: "dfce8854717946c4036d9974dadbf9c522a5df24ff5e98173c984bca000de140afb8a51e61565cd663fb9e2a970486d82492260ed86e5d677f7b11b2",
              quantity: "1",
            },
            {
              unit: "eb668fc2f03abfc301640ce2400c4e15bb8eb7188d14bc8cbacfdc58000de140afb8a51e61565cd663fb9e2a970486d82492260ed86e5d677f7b11b2",
              quantity: "1",
            },
          ],
        },
      },
      {
        input: {
          outputIndex: 2,
          txHash:
            "98420ab9b6d2d5d061deddb43434832fcfee6e4256c2253b477e46c847356c73",
        },
        output: {
          address:
            "addr_test1qzhm3fg7v9t9e4nrlw0z49cysmvzfy3xpmvxuht80aa3rvnm5tz7rfnph9ntszp2fclw5m334udzq49777gkhwkztsks4c69rg",
          amount: [
            {
              unit: "lovelace",
              quantity: "2020777357",
            },
          ],
        },
      },
      {
        input: {
          outputIndex: 3,
          txHash:
            "98420ab9b6d2d5d061deddb43434832fcfee6e4256c2253b477e46c847356c73",
        },
        output: {
          address:
            "addr_test1qzhm3fg7v9t9e4nrlw0z49cysmvzfy3xpmvxuht80aa3rvnm5tz7rfnph9ntszp2fclw5m334udzq49777gkhwkztsks4c69rg",
          amount: [
            {
              unit: "lovelace",
              quantity: "1010388679",
            },
          ],
        },
      },
      {
        input: {
          outputIndex: 1,
          txHash:
            "b5461230311cde067d202ebf22d6f511f2eadba8f8672d4b2835c07ee24abd22",
        },
        output: {
          address:
            "addr_test1qzhm3fg7v9t9e4nrlw0z49cysmvzfy3xpmvxuht80aa3rvnm5tz7rfnph9ntszp2fclw5m334udzq49777gkhwkztsks4c69rg",
          amount: [
            {
              unit: "lovelace",
              quantity: "4965428405",
            },
            {
              unit: "1c24687602c866101d41aa64e39685ee7092f26af15c5329104141fd6d657368",
              quantity: "1",
            },
            {
              unit: "60edd22048ec0169ffd4e3ab38c9588a7ef86e16f461a1ad239b5617000de140afb8a51e61565cd663fb9e2a970486d82492260ed86e5d677f7b11b2",
              quantity: "1",
            },
          ],
        },
      },
      {
        input: {
          outputIndex: 3,
          txHash:
            "b5461230311cde067d202ebf22d6f511f2eadba8f8672d4b2835c07ee24abd22",
        },
        output: {
          address:
            "addr_test1qzhm3fg7v9t9e4nrlw0z49cysmvzfy3xpmvxuht80aa3rvnm5tz7rfnph9ntszp2fclw5m334udzq49777gkhwkztsks4c69rg",
          amount: [
            {
              unit: "lovelace",
              quantity: "5052198771",
            },
            {
              unit: "b80aa257a376c9ae7aa0c7a323db88d236e11e0a5ed5e10142da9ea0000de14067676730",
              quantity: "1",
            },
          ],
        },
      },
      {
        input: {
          outputIndex: 0,
          txHash:
            "2675ee8dfb77890e50e05e88db0ae8b8e42328148750a822529650227b68119f",
        },
        output: {
          address:
            "addr_test1qzhm3fg7v9t9e4nrlw0z49cysmvzfy3xpmvxuht80aa3rvnm5tz7rfnph9ntszp2fclw5m334udzq49777gkhwkztsks4c69rg",
          amount: [
            {
              unit: "lovelace",
              quantity: "1080850",
            },
          ],
        },
      },
    ];
    const offlineFetcher = new OfflineFetcher();
    offlineFetcher.addUTxOs(extraInputs);
    offlineFetcher.addUTxOs([
      {
        input: {
          outputIndex: 1,
          txHash:
            "b5461230311cde067d202ebf22d6f511f2eadba8f8672d4b2835c07ee24abd22",
        },
        output: {
          address:
            "addr_test1qzhm3fg7v9t9e4nrlw0z49cysmvzfy3xpmvxuht80aa3rvnm5tz7rfnph9ntszp2fclw5m334udzq49777gkhwkztsks4c69rg",
          amount: [
            { unit: "lovelace", quantity: "4965428405" },
            {
              unit: "1c24687602c866101d41aa64e39685ee7092f26af15c5329104141fd6d657368",
              quantity: "1",
            },
            {
              unit: "60edd22048ec0169ffd4e3ab38c9588a7ef86e16f461a1ad239b5617000de140afb8a51e61565cd663fb9e2a970486d82492260ed86e5d677f7b11b2",
              quantity: "1",
            },
          ],
        },
      },
      {
        input: {
          outputIndex: 2,
          txHash:
            "b5461230311cde067d202ebf22d6f511f2eadba8f8672d4b2835c07ee24abd22",
        },
        output: {
          address:
            "addr_test1wz0xh6hszpghruw5x929w4rd5yyhh25qj38n57ej79gqg9gg72zy3",
          amount: [
            { unit: "lovelace", quantity: "1500000" },
            {
              unit: "b31f3a3fe3282d13bc12a406b05e671313336fe0acaab1bdbf36b85d30",
              quantity: "1",
            },
          ],
          dataHash:
            "092d5c11526dd6125bfb9941a2bf8f4d4bc2b7a3032dabaaf6ae2fe35b533b5c",
          plutusData:
            "d8799f9f581c1c24687602c866101d41aa64e39685ee7092f26af15c5329104141fd446d657368ffa000ff",
        },
      },
      {
        input: {
          outputIndex: 1,
          txHash:
            "9617e93dd4b3e75253d16ee90586e08b9f904c396f3a580580da09f820c42d0a",
        },
        output: {
          address:
            "addr_test1qqyxeduckrmffn26gjffda77nfu560xctycf00jcnr74p7vdx9gcw644ygkqgqcfm5nlrecqv0rzp0qcyw55q3lxcpkq093wet",
          amount: [{ unit: "lovelace", quantity: "50000000" }],
          scriptRef:
            "8203590da2590d9f010100332323232323232323232322322598009919191919299919806180098071baa00213233225980080344c8c8c9660026006003159800980a9baa00980140410164566002600e003159800980a9baa0098014041016456600266e1d20040018acc004c054dd5004c00a02080b2020809101220243013375401026464646464646464646464646464b3001300f3020375400313232598009808800c4c966002602460466ea80062b300132323259800800c00a2b3001302b001899194c004dd718160014dd71816000cdd698161816800a444b30013371e00601f15980099b8f002008899b870014800629410294528205218160009bac302a001801205040a0646600200202244b30010018a5eb82264646464660020026eacc0b001089660020031003899198181ba733030375200a66060605a00266060605c00297ae0330030033032002303000140b866008008605c0066eb8c0a0004c0ac0050290a50375c604e60506eb0c09cc090dd5000c528c54cc08924013d6f6e6c795f6d696e7465645f746f6b656e286d696e742c206d656d6265725f746f6b656e2c2061737365745f6e616d652c202d3129203f2046616c73650014a0810a2a660449216365787065637420536f6d6528285f2c2061737365745f6e616d652c205f2929203d0a2020202020202020202076616c75655f706f6c6963795f696e666f286f776e5f696e7075742e6f75747075742e76616c75652c206d656d6265725f746f6b656e2900164084646600200264660020026eacc02cc094dd5180598129baa0042259800800c52f5c1132323232330010013756605400844b30010018801c4c8cc0b8dd3998171ba90053302e302b0013302e302c0014bd701980180198180011817000a05833004004302c003375c604c00260520028138896600200314c0103d87a8000899912cc004cdc79bae302a00200a89807998149ba70024bd7044cc0100100050241bac302800130290014099159800980a800c5660026464b3001001801456600260520031323298009bae302a0029bae302a0019bad302a302b00148896600266e3c00c0322b30013371e0049101008980e000c528204e8a50409c302a0013758605000300240988130c8cc00400403c896600200314bd7044c8c8c8c8cc004004dd59815002112cc00400620071323302e374e6605c6ea4014cc0b8c0ac004cc0b8c0b00052f5c0660060066060004605c0028160cc010010c0b000cdd718130009814800a04e14a114a315330214913c6f6e6c795f6d696e7465645f746f6b656e286d696e742c2070726f706f73655f696e74656e745f746f6b656e2c2022222c203129203f2046616c73650014a081022b300132323300100100e2259800800c52844cc896600266ebc01400a29462660080080028128c094c0a4004c0a800502719ba548008cc094dd480225eb8229462a6604292011f7769746864726177616c5f7363726970745f636865636b203f2046616c73650014a0810102020403021375402c604860426ea80062a6603e92013265787065637420536f6d65286f776e5f696e70757429203d2066696e645f696e70757428696e707574732c20696e70757429001640786600e6eb0c08c0348cdd7981218109baa001011375c604460466046604660466046604660460066eb8c084008dd7181000118101810000980f980f980f980f980f980f980f980f980f980d9baa323232598009806180e9baa0018992cc0040062b3001300d301e375400313259800800c072264b300100180ec07626464b300100180fc4c96600200302081040820411323259800800c08a264b3001001811c08e0471323259800800c096264b3001001813409a04d026899192cc00400605113259800800c4c96600200302a8992cc00400605702b815c0ae26464b3001001816c4c96600200313259800800c0be264b300100181840c2061030899192cc00400606513259800800c4c9660020030348992cc00400606b03581ac0d626464b300100181bc4c96600200313259800800c0e6264b300100181d40ea07503a899192cc00400607913259800800c4c96600200303e8992cc00400607f03f81fc0fe26464b3001001820c4c96600200313259800800c10e264b30010018224112089044899192cc00400608d13259800800c4c9660020030488992cc004006264b300100182544c96600200304b825c12e09713259800982a001c4c8cc0040040c088c96600200519800813c660020451980080ec6600203119800809c6600201d19800804c6600200f1035827a06e827a06e827a06e827a06e827a06e827a06e827a06e827a06e8992cc0040060a10508284142264600660b20086eb8005059182b00120a8300200282620a2375c00282a0c14400504f18288014126093049824a0a4304f0014134609e005047823c11e08e8280c13400504b18268019bae001413460940028240c12800a085042821410904b1824000a08c3048003375c0028240c114005043182280140f607b03d81ea08c3043001410460860066eb80050431820000a07c304000281c40e20710384104607c00281e0c0f800cdd7000a07c303b00140e46076005033819c0ce06681e0c0e4005037181c8019bae00140e4606c00281a0c0d800a05d02e81740b9037181a000a0643034003375c00281a0c0c400502f181880140a6053029814a064302f00140b4605e0066eb800502f1816000a054302c003375a00302340b060520028138c0a400cdcc9bae00140a4604c0028120c09800cdd6000c07603a8130c08c005021180f9baa00180da03880dc06e03701b40906464b3001300e0018a9980f2481274f7261636c6520696e70757420646f6573206e6f7420636f6e7461696e20616e7920646174756d00168acc004c0480062a6603c921224f7261636c6520696e70757420646174756d206d75737420626520696e6c696e656400168981198101baa002407480e8c078dd5000981098111811180f1baa3004301e37546042603c6ea80062a660389201c165787065637420536f6d65286f7261636c655f696e70757429203d0a202020207265666572656e63655f696e707574730a2020202020207c3e206c6973742e66696e64280a20202020202020202020666e287265665f696e7075743a20496e70757429207b0a2020202020202020202020207175616e746974795f6f66287265665f696e7075742e6f75747075742e76616c75652c206f7261636c655f6e66742c20222229203d3d20310a202020202020202020207d2c0a2020202020202020290016406c660086eb0c0800248c040c9660026022603c6ea80062900044dd69811180f9baa001407064b30013011301e375400314c103d87a8000899198008009bab30233020375400444b30010018a6103d87a80008994c004dd71810800cdd69811000cc0980092225980099b914881000038acc004cdc7a4410000389806998139ba80024bd704530103d87a8000408913300600600140883024001408880e0c8cc004004dd59802980f9baa3005301f375400444b30010018a60103d87a80008994c004dd71810000cdd59810800cc0940092225980099b9101d0038acc004cdc780e801c4c030cc098dd300125eb82298103d87a80004085133006006001408430230014084444b3001300d301e375400713259800800c00a264b30010018992cc00400600913259800800c566002604e00519800801c4c966002602400313259800800c01e264b30010018acc004c0a800a264b300130150018992cc00400601513259800800c566002605a00519800800c0320168072016815201700b805c02d02e1815800a05230273754005159800980c800c4c96600200300a8992cc00400601700b805c4c8c96600200300d8992cc00400601d00e80744c8c9660020030108992cc004006023011808c4c96600260680070138092062375a00301140d060620028178c0c400cdd6800c0390311817000a058302e003375a00300b40b860560028148c09cdd50014025024204830253754003008409d00880440220108158c0a000502618121baa0028acc004c0580062b300130243754005007803204a8032042408460446ea800600a804200a812200b005802c0150281812800a0463025002801c00e007003409860460028108c07cdd5001c00501c111192cc004c034006264b3001001801c4c9660020030048024012009132598009813001c01a00a8118dd7000a04c30230014084603e6ea80122b300130110018992cc00400600713259800800c01200900480244c966002604c007006802a046375c0028130c08c005021180f9baa00480120384070603a6ea800c8c078c07c00488c8cc00400400c896600200314c0103d87a8000899912cc004c01400a2600e6604200497ae0899802002000a0383020001302100140786e95200037566034603660360046eacc064004c064c064c064004c060004c04cdd50041b874800201b00d806c03501718098009809980a00098079baa002370e90010b1808180880198078011807001180700098049baa0018a4d153300749011856616c696461746f722072657475726e65642066616c7365001365640186eb800454cc00d2411d72656465656d65723a204d656d6265725370656e6452656465656d6572001615330024913a657870656374206f7261636c655f696e7075745f646174756d3a204f7261636c65446174756d203d206f7261636c655f696e7075745f6461746100165734ae7155ceaab9e5573eae815d0aba257489811e581c6c4c6918f595b6c61aca852ff6d8bbf3c16774614ac08b516114b35d0001",
          scriptHash:
            "9e6beaf0105171f1d4315457546da1097baa80944f3a7b32f1500415",
        },
      },
      {
        input: {
          outputIndex: 5,
          txHash:
            "98420ab9b6d2d5d061deddb43434832fcfee6e4256c2253b477e46c847356c73",
        },
        output: {
          address:
            "addr_test1qzhm3fg7v9t9e4nrlw0z49cysmvzfy3xpmvxuht80aa3rvnm5tz7rfnph9ntszp2fclw5m334udzq49777gkhwkztsks4c69rg",
          amount: [{ unit: "lovelace", quantity: "5000000" }],
        },
      },
      {
        input: {
          outputIndex: 0,
          txHash:
            "f2c95746f252b609e03ca9447548589aa3def1a83bb0d7d67617be041dfef203",
        },
        output: {
          address:
            "addr_test1wpj75ghh2qlnnv8c9gsd2nypu3as2jy034kjk7qm6qprwwc2xvykm",
          amount: [
            { unit: "lovelace", quantity: "6000000" },
            {
              unit: "6c4c6918f595b6c61aca852ff6d8bbf3c16774614ac08b516114b35d",
              quantity: "1",
            },
          ],
          dataHash:
            "5a976e217be07cf1e7d3fdccbbe05295fe383bac0e7529a62933022ba32afb27",
          plutusData:
            "d8799f9f581c086cb798b0f694cd5a449296f7de9a794d3cd8593097be5898fd50f9581cafb8a51e61565cd663fb9e2a970486d82492260ed86e5d677f7b11b2ff44544f444f01581c6c4c6918f595b6c61aca852ff6d8bbf3c16774614ac08b516114b35dd8799fd87a9f581c65ea22f7503f39b0f82a20d54c81e47b05488f8d6d2b781bd002373bffd87a80ff581c464a5f237aff10cd1a481ee6c7bcc9bcf3df00929107ee3ceba9a90ed8799fd87a9f581cc640ea777979004f6f052507a6422aaae6120d8c78c23f234f28dc7cffd87a80ff581c48e9fe0a79a0dd4f136001fb64f85e01d67b7701f10b8e63545ea1b4d8799fd87a9f581c3ceca3b074a65435ce3adc7703214db701d440f8f33827b10638bda8ffd87a80ff581cb31f3a3fe3282d13bc12a406b05e671313336fe0acaab1bdbf36b85dd8799fd87a9f581c9e6beaf0105171f1d4315457546da1097baa80944f3a7b32f1500415ffd87a80ff581c3c19ec0b1c30667e262ed854679cf6fc8eacd0a0aa549006232a0058d8799fd87a9f581cfe4ebc55efbfda47cf7ab71f9b5c4f62a679f3896f474d1f81f27a7affd87a80ff581c824e3c6f95b7d6d7fce6922caaeb580812b5ab23c3219c35aa6e43b0d8799fd87a9f581cb91f07cf1330ef68b7edb478e51924f59890ddb2bd7de1451858173dffd87a80ff581c34df2ed2dd5925e37b2c44755f8986e0a6ac25abb5ba8297a3360879d8799fd87a9f581c12d6d4c1f44996d549c3ab380c82dc3e0848b787e77412f61d3d4994ffd87a80ffd8799fd87a9f581c7bac54acaace5bd7da3dce39bd6780bb7001568bf327f3e6096ce79cffd87a80ff581cb4966ca9050dd4cfbdd8ee6e5c5efde73eb1fe9106035836fff1eb49ff",
        },
      },
      {
        input: {
          outputIndex: 0,
          txHash:
            "d476ac0425a1bdc53557bf1b9d52ad5204bc96a5b0a5ebf40a224b43e4e8d400",
        },
        output: {
          address:
            "addr_test1qqyxeduckrmffn26gjffda77nfu560xctycf00jcnr74p7vdx9gcw644ygkqgqcfm5nlrecqv0rzp0qcyw55q3lxcpkq093wet",
          amount: [{ unit: "lovelace", quantity: "50000000" }],
          scriptRef:
            "8203591a4a591a47010100332323232323232323232323232323232323223225980099191919192999198099800980a9baa0021325980080244c8c8c8c8c8c966002601000313259800800c04a264b3001001809c04e027013899192cc00400602b13259800800c05a02d016899192cc00400603113259800800c566002605200519800800c02a0328062032813203301980cc06502a1813800a04a3027003375a003016409c60480028110c09000cdcc9bae0014090604200280f8c074dd50054566002600c003159800980e9baa00a801404501e45660026006003159800980e9baa00a801404501e404501a2034406860366ea80244c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c96600260400051323298009b99375c6074005375a6074003303a303b0014888c9660020030308992cc004c10000a264b30010018acc004c0a0c0f0dd5000c4c9660020030348992cc00400606b035899192cc00400606f13259800800c0e226464b300100181d44c96600200303b81dc0ee264b3001304a0038acc00401e07913259800800c0f607b03d81ec4c8c96600200303f8992cc0040060810408204102264b3001304f003899813804912cc00400a26464b300100182344c96600260a8005132323259800800c12e264b300130580028992cc00400609d159800982c800c4c9660020030508992cc004c16c00a26464b30010018acc004c110c160dd5000c4c9660020030558992cc0040060ad05682b415a26464b300100182c44c96600200305982cc16626464b300100182dc4c966002003159800983280146600200313259800acc00404629462a660c092012469735f6d656d6265725f6f75747075745f76616c75655f636c65616e203f2046616c73650014a082fa2b300159800805c528c54cc18124012469735f696e74656e745f6f75747075745f76616c75655f636c65616e203f2046616c73650014a082fa2b300159800800c528c54cc18124011f69735f696e74656e745f646174756d5f636f7272656374203f2046616c73650014a082fa2b30019800820c13291100a4004818229462a660c09201316f6e6c795f6d696e7465645f746f6b656e286d696e742c20706f6c6963795f69642c2022222c203129203f2046616c73650014a082fa294105f452820be8a50417c66ebc024c0f0cc18cdd49b9802a330633750052660c605097ae082e209082e20c482e41720b905c419860c60028308c18c00cdd6800c1650631830000a0bc306000337326eb8005060182e800a0b630593754003054415905482a41520a882f0c966002607e60b06ea8006260b860b26ea80062a660ae92012c65787065637420496e6c696e65446174756d287261775f646174756d29203d206f75747075742e646174756d0016415860b660b860b860b06ea8008c0f4c966002003148002264601264b30010028a40011300a33001001305e002416c44b30010018a40011300b33002002305f001417060b800282c8c8cc004004dd5981a982c1baa0022259800800c52f5c113232323233001001375660ba00844b30010018801c4c8cc184dd3998309ba900533061305e00133061305f0014bd701980180198318011830800a0be33004004305f003375c60b200260b800282d20a282c0c164005057191980080081b112cc004006297ae0899912cc0056600266ebcc170c164dd500101544c8cc004004c8cc004004dd5982f182f982d9baa0042259800800c52f5c113232323233001001375660c000844b30010018801c4c8cc190dd3998321ba90053306430610013306430620014bd701980180198330011832000a0c4330040043062003375c60b800260be00282e8896600200314a1133225980099b8f375c60c000408f14a313300400400141686eb0c178004c17c00505c452820ac89982d80119802002000c4cc010010005056182d000982d800a0b082720ac41593001302030543754606260a86ea80066eb8c08001e6eb8c0c401d22232330010010382259800800c52f5c11332259800acc004cdd7982f182d9baa00200789822192cc004c114c16cdd5000c5200089bad305f305c375400282c8c966002608a60b66ea8006298103d87a8000899198008009bab3060305d375400444b30010018a6103d87a80008994c004dd7182f000cdd6982f800cc18c0092225980099b9100c0038acc004cdc7806001c4c0f4cc190dd400125eb82298103d87a8000417d133006006001417c3061001417c82c8c8cc004004dd5982f9830182e1baa0032259800800c530103d87a80008994c004dd7182e800cdd5982f000cc1880092225980099b9100c0038acc004cdc7806001c4c0f0cc18cdd300125eb82298103d87a8000417913300600600141783060001417914a082c22660ba00466008008003133004004001416060b800260ba00282d104c415460ac00282a0cc88c8cc0040040d8896600200314bd7044cc8966002608264b300130423058375400314800226eb4c170c164dd5000a0ac32598009821182c1baa0018a6103d87a8000899198008009bab305d305a375400444b30010018a6103d87a80008994c004dd7182d800cdd6982e000cc1800092225980099b9100c0038acc004cdc7806001c4c0e8cc184dd400125eb82298103d87a800041711330060060014170305e001417082b0c8cc004004dd5982e182e982c9baa305c305d3059375400644b30010018a60103d87a80008994c004dd7182d000cdd5982d800cc17c0092225980099b9100c0038acc004cdc7806001c4c0e4cc180dd300125eb82298103d87a8000416d133006006001416c305d001416d13305a00233004004001899802002000a0aa3059001305a001415c6eb8c078014dd71817802981b992cc0040062900044c8c00cc966002005148002260086600200260b000482a889660020031480022600a6600400460b200282b0c15800505319198008009bab302f3052375400644b30010018a5eb82264646464660020026eacc15c010896600200310038991982d9ba73305b375200a660b660b0002660b660b200297ae033003003305d002305b00141646600800860b20066eb8c14c004c1580050541b804800a08e8288c1480050501919800800817912cc004006297ae0899912cc0056600266ebcc154c148dd500101244c8cc004004c8cc004004dd5982b982c182a1baa0042259800800c52f5c113232323233001001375660b200844b30010018801c4c8cc174dd39982e9ba90053305d305a0013305d305b0014bd7019801801982f801182e800a0b633004004305b003375c60aa00260b000282b0896600200314a1133225980099b8f375c60b200405314a3133004004001414c6eb0c15c004c1600050554528209e89982a00119802002000c4cc01001000504f1829800982a000a0a2375860a0609a6ea804626464b3001001822c11608b045899192cc00400608f047823c4c8c018c15801cdd6800c11d05618280019b99375c00282a0c134004c14000904e410504c1bae001413c60980028250c130024dd7000a0983049007411d03c411c6eb40060768250c11c00504518238019bab00181c40e20708238c11000504218220019bac00181ac0d50441820800a07e303d375400303340e9033819c0ce0668210c966002604660786ea800626080607a6ea80062a6607692012c65787065637420496e6c696e65446174756d287261775f646174756d29203d206f75747075742e646174756d001640e8607e6080608060786ea8c064c0f0dd5000c0c503d181f000a078323300100101c2259800800c52f5c11332259800acc004cdd79820981f1baa30413042303e375400402113233001001323300100137566086608860806ea8c10cc110c100dd5002112cc004006297ae0899191919198008009bab30450042259800800c400e264660926e9ccc124dd4802998249823000998249823800a5eb80cc00c00cc12c008c1240050471980200218238019bae30410013044001410844b30010018a50899912cc004cdc79bae30450020158a51899802002000a07e375860860026088002820a294103b44cc100008cc01001000626600800800281d8c0fc004c10000503d0c0e8004c0d4dd50114566002603c00513259800acc006600202b020a44100a4002800a29462a66068920139706f6c6963795f6f6e6c795f6d696e7465645f746f6b656e286d696e742c20706f6c6963795f69642c2022222c202d3129203f2046616c73650014a0819a2b3001980080ac01a91100a4004800a29462a6606892013d706f6c6963795f6f6e6c795f6d696e7465645f746f6b656e286d696e742c2070726f706f73616c5f746f6b656e2c2022222c203129203f2046616c73650014a0819a2941033111119192cc004006005159800981f800c4c8cc896600266e3c00801e266e1c00401a294103b1bae303f001375a607e6080002607e6eb0c0f800600481e103c19198008009805003112cc004006297ae0899912cc004cdc79bae300a0020088998201ba700233004004001899802002000a0763758607e002608000281e852844c966002b3001980080ac08291100a4002802229462a660689201326f6e6c795f6d696e7465645f746f6b656e286d696e742c20706f6c6963795f69642c2022222c202d3129203f2046616c73650014a0819a2b30010018a518a9981a24811e69735f61646d696e735f6d756c74695f7369676e6564203f2046616c73650014a0819a2941033194c00400601700a4004444b30010028a50899912cc004c8cc004004064896600200314a1133225980099b8f0020068a51899802002000a076375c607e002608000281ea2b3001337109001001c6600200b00199b80003480050054528a06e8cc004016003003401481b8dd7181d801181e001207240c881908c0e0004c0c8dd5010111119192cc004006005159800981e000c4c8ca60026eb8c0f400a6eb8c0f40066eb4c0f4c0f80052225980099b8f00300a8acc004cdc7801004c4cdc3800804452820748a5040e8303d0013758607600300240e481c8c01801452811919800800801112cc004006297ae08994c004dd7181a000cdd5981a800ccc00c00cc0e400922232330010010032259800800c400e2646607a6e9ccc0f4dd48031981e981d0009981e981d800a5eb80cc00c00cc0fc008c0f400503b0c0dc0050351bae3033303400630320053031005375c606000a6eb4c0bc014dd6181700298171817000981680098161816181618161816181618160009815981580098131baa3259800980918131baa0018992cc0040062b300130133027375400313259800800c096264b3001001813409a26464b300100181444c966002003029814c0a60531323259800800c0ae264b300100181640b20591323259800800c0ba264b3001001817c0be05f02f899192cc00400606313259800800c4c9660020030338992cc00400606903481a40d226464b300100181b44c96600200313259800800c0e2264b300100181cc0e6073039899192cc00400607713259800800c4c96600200303d8992cc00400607d03e81f40fa26464b300100182044c96600200313259800800c10a264b3001001821c10e087043899192cc00400608b13259800800c4c9660020030478992cc004006091048824412226464b300100182544c96600200313259800800c132264b3001001826c13609b04d899192cc00400609f13259800800c4c9660020030518992cc004006264b3001001829c4c96600200305482a41520a913259800982e801c4cc0d40bc8966002005198008134660020431980080e46600202f1980080946600201b1980080446600200d103482ba08482ba08482ba08482ba08482ba08482ba08482ba08482ba0848992cc0040060b105882c4162264600660c20086eb8005061182f00120b882aa0b4375c00282e8c168005058182d001414a0a505282920b63058001415860b000505082841420a082c8c158005054182b0019bae001415860a60028288c14c00a09704b825c12d0541828800a09e3051003375c0028288c13800504c1827001411a08d046823209e304c001412860980066eb800504c1824800a08e3049002820c1060830414128608e0028228c11c00cdd7000a08e30440014108608800503c81e40f20788228c10800504018210019bae0014108607e00281e8c0fc00a06f03781bc0dd040181e800a076303d003375c00281e8c0e8005038181d00140ca0650328192076303800140d860700066eb8005038181a800a0663035003375a00302c40d460640028180c0c800cdcc9bae00140c8605e0028168c0bc00cdd6000c09a04c8178c0b000502a18141baa001812204a812409204902440b46464b300130140018a99813a49274f7261636c6520696e70757420646f6573206e6f7420636f6e7461696e20616e7920646174756d00168acc004c0480062a6604e921224f7261636c6520696e70757420646174756d206d75737420626520696e6c696e656400168981618149baa00240988130c09cdd500098151815981598139baa3004302737546054604e6ea80062a6604a9201c165787065637420536f6d65286f7261636c655f696e70757429203d0a202020207265666572656e63655f696e707574730a2020202020207c3e206c6973742e66696e64280a20202020202020202020666e287265665f696e7075743a20496e70757429207b0a2020202020202020202020207175616e746974795f6f66287265665f696e7075742e6f75747075742e76616c75652c206f7261636c655f6e66742c20222229203d3d20310a202020202020202020207d2c0a2020202020202020290016409064660020026eb0c0a802c896600200314c0103d87a8000899912cc004c04cc966002602860546ea80062900044dd6981718159baa00140a064b30013014302a375400314c103d87a8000899198008009bab302f302c375400444b30010018a6103d87a80008994c004dd71816800cdd69817000cc0c80092225980099b914881000038acc004cdc7a4410000389806198199ba80024bd704530103d87a800040b913300600600140b8303000140b88140c8cc004004dd5980418159baa3008302b375400644b30010018a60103d87a80008994c004dd71816000cdd59816800cc0c40092225980099b910220038acc004cdc7811001c4c02ccc0c8dd300125eb82298103d87a800040b513300600600140b4302f00140b5130053302c0024bd7044cc01001000502718158009816000a052374a9000111919800800801911980180098010011181398140009bac30253026302630263026004375660480066eb0c08c00cdd618110021811181100098108009810000980d9baa009370e90021112cc004c01cc06cdd5001c4c9660020030028992cc004006264b300100180244c9660020031598009812001466002007132598009806000c4c9660020030078992cc0040062b300130270028992cc004c03c006264b300100180544c966002003159800981500146600200300c805a01c805a04e805c02e01700b40ac60500028130c090dd50014566002601a00313259800800c02a264b3001001805c02e0171323259800800c036264b3001001807403a01d1323259800800c042264b3001001808c046023132598009818801c04e0248170dd6800c0450311817000a058302e003375a00300e40b860560028148c0ac00cdd6800c02d02b1814000a04c3024375400500940848108c088dd5000c021024402201100880420503025001408c60426ea800a2b3001300a0018acc004c084dd5001401e00c811200c80f101e180f9baa001802a010802a042802c01600b005409460440028100c08800a007003801c00d0231810000a03c301c3754007001406444464b300130070018992cc00400600713259800800c01200900480244c9660026046007006802a040375c0028118c08000501e180e1baa0048acc004c014006264b3001001801c4c9660020030048024012009132598009811801c01a00a8100dd7000a0463020001407860386ea801200480c9019180d1baa003370e9001402e01700b805a038375c6032602c6ea8008dc3a40002c602e6030006602c004602a004602a00260206ea8006293454cc0392411856616c696461746f722072657475726e65642066616c7365001365640346eb800454cc0292412372656465656d65723a2050726f706f7365496e74656e744d696e7452656465656d6572001615330094915d657870656374205b6d656d6265725f696e7075745d203d0a20202020202020202020696e707574735f61745f776974685f706f6c69637928696e707574732c206d656d6265725f616464726573732c206d656d6265725f746f6b656e29001615330084915b657870656374206d656d6265725f696e7075745f646174756d3a204d656d626572446174756d203d0a202020202020202020206f75747075745f696e6c696e655f646174756d286d656d6265725f696e7075742e6f7574707574290016153300749160657870656374205b6d656d6265725f6f75747075745d203d0a202020202020202020206f7574707574735f61745f776974685f706f6c696379286f7574707574732c206d656d6265725f616464726573732c206d656d6265725f746f6b656e290016153300649140657870656374205b746f6b656e5f696e7075745d203d20696e707574735f7769746828696e707574732c20746f6b656e2e3173742c20746f6b656e2e326e64290016153300549148657870656374205b5f5d203d206f7574707574735f61745f77697468286f7574707574732c20746f6b656e5f6f776e65722c20746f6b656e2e3173742c20746f6b656e2e326e64290016153300449165657870656374205b696e74656e745f6f75747075745d203d0a202020202020202020206f7574707574735f61745f776974685f706f6c696379286f7574707574732c2070726f706f73655f696e74656e745f616464726573732c20706f6c6963795f696429001615330034915865787065637420696e74656e745f6f75747075745f646174756d3a2050726f706f73616c446174756d203d0a202020202020202020206f75747075745f696e6c696e655f646174756d28696e74656e745f6f757470757429001615330024913a657870656374206f7261636c655f696e7075745f646174756d3a204f7261636c65446174756d203d206f7261636c655f696e7075745f6461746100165734ae7155ceaab9e5573eae815d0aba257489811e581c6c4c6918f595b6c61aca852ff6d8bbf3c16774614ac08b516114b35d0001",
          scriptHash:
            "3c19ec0b1c30667e262ed854679cf6fc8eacd0a0aa549006232a0058",
        },
      },
    ]);
    const offlineEvaluator = new OfflineEvaluator(offlineFetcher, "preprod");
    const mesh = new MeshTxBuilder({
      fetcher: offlineFetcher,
      evaluator: offlineEvaluator,
    });
    expect(
      await mesh.complete({
        inputs: [
          {
            type: "PubKey",
            txIn: {
              txHash:
                "b5461230311cde067d202ebf22d6f511f2eadba8f8672d4b2835c07ee24abd22",
              txIndex: 1,
              amount: [
                { unit: "lovelace", quantity: "4965428405" },
                {
                  unit: "1c24687602c866101d41aa64e39685ee7092f26af15c5329104141fd6d657368",
                  quantity: "1",
                },
                {
                  unit: "60edd22048ec0169ffd4e3ab38c9588a7ef86e16f461a1ad239b5617000de140afb8a51e61565cd663fb9e2a970486d82492260ed86e5d677f7b11b2",
                  quantity: "1",
                },
              ],
              address:
                "addr_test1qzhm3fg7v9t9e4nrlw0z49cysmvzfy3xpmvxuht80aa3rvnm5tz7rfnph9ntszp2fclw5m334udzq49777gkhwkztsks4c69rg",
            },
          },
          {
            type: "Script",
            txIn: {
              txHash:
                "b5461230311cde067d202ebf22d6f511f2eadba8f8672d4b2835c07ee24abd22",
              txIndex: 2,
              amount: [
                { unit: "lovelace", quantity: "1500000" },
                {
                  unit: "b31f3a3fe3282d13bc12a406b05e671313336fe0acaab1bdbf36b85d30",
                  quantity: "1",
                },
              ],
              address:
                "addr_test1wz0xh6hszpghruw5x929w4rd5yyhh25qj38n57ej79gqg9gg72zy3",
            },
            scriptTxIn: {
              redeemer: {
                data: {
                  type: "JSON",
                  content: '{"constructor":1,"fields":[]}',
                },
                exUnits: { mem: 7000000, steps: 3000000000 },
              },
              scriptSource: {
                type: "Inline",
                txHash:
                  "9617e93dd4b3e75253d16ee90586e08b9f904c396f3a580580da09f820c42d0a",
                txIndex: 1,
                scriptHash:
                  "9e6beaf0105171f1d4315457546da1097baa80944f3a7b32f1500415",
                version: "V3",
                scriptSize: "3493",
              },
              datumSource: {
                type: "Inline",
                txHash:
                  "b5461230311cde067d202ebf22d6f511f2eadba8f8672d4b2835c07ee24abd22",
                txIndex: 2,
              },
            },
          },
        ],
        outputs: [
          {
            address:
              "addr_test1wrlya0z4a7la537002m3lx6ufa32v70n39h5wngls8e857srl5lm5",
            amount: [
              { unit: "lovelace", quantity: "1500000" },
              {
                unit: "3c19ec0b1c30667e262ed854679cf6fc8eacd0a0aa549006232a0058",
                quantity: "1",
              },
            ],
            datum: {
              type: "Inline",
              data: {
                type: "JSON",
                content:
                  '{"constructor":0,"fields":[{"bytes":"313131"},{"int":1111111},{"constructor":0,"fields":[{"constructor":0,"fields":[{"bytes":"afb8a51e61565cd663fb9e2a970486d82492260ed86e5d677f7b11b2"}]},{"constructor":0,"fields":[{"constructor":0,"fields":[{"constructor":0,"fields":[{"bytes":"7ba2c5e1a661b966b8082a4e3eea6e31af1a2054bef7916bbac25c2d"}]}]}]}]}]}',
              },
            },
          },
          {
            address:
              "addr_test1qzhm3fg7v9t9e4nrlw0z49cysmvzfy3xpmvxuht80aa3rvnm5tz7rfnph9ntszp2fclw5m334udzq49777gkhwkztsks4c69rg",
            amount: [
              { unit: "lovelace", quantity: "4965428405" },
              {
                unit: "1c24687602c866101d41aa64e39685ee7092f26af15c5329104141fd6d657368",
                quantity: "1",
              },
              {
                unit: "60edd22048ec0169ffd4e3ab38c9588a7ef86e16f461a1ad239b5617000de140afb8a51e61565cd663fb9e2a970486d82492260ed86e5d677f7b11b2",
                quantity: "1",
              },
            ],
          },
          {
            address:
              "addr_test1wz0xh6hszpghruw5x929w4rd5yyhh25qj38n57ej79gqg9gg72zy3",
            amount: [
              { unit: "lovelace", quantity: "1500000" },
              {
                unit: "b31f3a3fe3282d13bc12a406b05e671313336fe0acaab1bdbf36b85d30",
                quantity: "1",
              },
            ],
            datum: {
              type: "Inline",
              data: {
                type: "CBOR",
                content:
                  "d8799f9f581c1c24687602c866101d41aa64e39685ee7092f26af15c5329104141fd446d657368ffa000ff",
              },
            },
          },
        ],
        fee: "0",
        collaterals: [
          {
            type: "PubKey",
            txIn: {
              txHash:
                "98420ab9b6d2d5d061deddb43434832fcfee6e4256c2253b477e46c847356c73",
              txIndex: 5,
              amount: [{ unit: "lovelace", quantity: "5000000" }],
              address:
                "addr_test1qzhm3fg7v9t9e4nrlw0z49cysmvzfy3xpmvxuht80aa3rvnm5tz7rfnph9ntszp2fclw5m334udzq49777gkhwkztsks4c69rg",
            },
          },
        ],
        requiredSignatures: [],
        referenceInputs: [
          {
            txHash:
              "f2c95746f252b609e03ca9447548589aa3def1a83bb0d7d67617be041dfef203",
            txIndex: 0,
          },
        ],
        mints: [
          {
            type: "Plutus",
            policyId:
              "3c19ec0b1c30667e262ed854679cf6fc8eacd0a0aa549006232a0058",
            scriptSource: {
              type: "Inline",
              txHash:
                "d476ac0425a1bdc53557bf1b9d52ad5204bc96a5b0a5ebf40a224b43e4e8d400",
              txIndex: 0,
              version: "V3",
              scriptSize: "6733",
              scriptHash:
                "3c19ec0b1c30667e262ed854679cf6fc8eacd0a0aa549006232a0058",
            },
            redeemer: {
              data: {
                type: "JSON",
                content:
                  '{"constructor":0,"fields":[{"bytes":"313131"},{"int":1111111},{"constructor":0,"fields":[{"constructor":0,"fields":[{"bytes":"afb8a51e61565cd663fb9e2a970486d82492260ed86e5d677f7b11b2"}]},{"constructor":0,"fields":[{"constructor":0,"fields":[{"constructor":0,"fields":[{"bytes":"7ba2c5e1a661b966b8082a4e3eea6e31af1a2054bef7916bbac25c2d"}]}]}]}]}]}',
              },
              exUnits: { mem: 7000000, steps: 3000000000 },
            },
            mintValue: [{ assetName: "", amount: "1" }],
          },
        ],
        changeAddress:
          "addr_test1qzhm3fg7v9t9e4nrlw0z49cysmvzfy3xpmvxuht80aa3rvnm5tz7rfnph9ntszp2fclw5m334udzq49777gkhwkztsks4c69rg",
        metadata: new Map(),
        validityRange: {},
        certificates: [],
        withdrawals: [],
        votes: [],
        signingKey: [],
        chainedTxs: [],
        inputsForEvaluation: {},
        network: "preprod",
        expectedNumberKeyWitnesses: 0,
        expectedByronAddressWitnesses: [],
        extraInputs,
      }),
    ).toBeTruthy();
  });
});
