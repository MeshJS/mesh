import {
  applyCborEncoding,
  DEFAULT_REDEEMER_BUDGET,
  mConStr0,
  NativeScript,
  resolveNativeScriptHash,
  resolveNativeScriptHex,
  resolveScriptHash,
  resolveScriptHashDRepId,
} from "@meshsdk/core";
import { resolvePlutusScriptAddress } from "@meshsdk/core-cst";
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
});
