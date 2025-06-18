import { byteString, conStr0, MeshValue, UTxO } from "@meshsdk/common";
import { TxParser } from "@meshsdk/core";
import { CSLSerializer, resolveDataHash } from "@meshsdk/core-csl";

describe("TxTester", () => {
  it("should test transaction validation", async () => {
    const serializer = new CSLSerializer();
    const txParser = new TxParser(serializer);
    // Create datum and get its CBOR/hash
    const datum =
      '{"constructor":0,"fields":[{"constructor":0,"fields":[{"constructor":0,"fields":[{"bytes":"41bfc7325343428683bbd0b94a4da41c"},{"constructor":0,"fields":[{"bytes":"e1197f10e85bc4a3a812e34e22339e1df56b7fb6386a9510d7a304ff"}]},{"constructor":0,"fields":[{"bytes":"7c87b6b5a0963af3eadb107da2ac4e1d34747a4df363858b649aa845"}]}]}]},{"map":[{"k":{"bytes":""},"v":{"map":[{"k":{"bytes":""},"v":{"int":10000000}}]}}]}]}';

    const datumCbor = serializer.serializeData({
      content: datum,
      type: "JSON",
    });
    const datumHash = resolveDataHash(datumCbor, "CBOR");

    // Define UTxOs
    const utxo1: UTxO = {
      input: {
        outputIndex: 0,
        txHash:
          "1a6157c0c9e170d716aee64b25384cad275770e2ef86df31eeebda4892980723",
      },
      output: {
        address:
          "addr_test1qrs3jlcsapdufgagzt35ug3nncwl26mlkcux49gs673sflmrjfm6y2eu7del3pprckzt4jaal9s7w9gq5kguqs5pf6fq542mmq",
        amount: [
          {
            quantity: "10000000000",
            unit: "lovelace",
          },
        ],
      },
    };

    const utxo2: UTxO = {
      input: {
        outputIndex: 5,
        txHash:
          "158a0bff150e9c6f68a14fdb1623c363f54e36cb22efc800911bffafa4e53442",
      },
      output: {
        address:
          "addr_test1qra9zdhfa8kteyr3mfe7adkf5nlh8jl5xcg9e7pcp5w9yhyf5tek6vpnha97yd5yw9pezm3wyd77fyrfs3ynftyg7njs5cfz2x",
        amount: [
          {
            quantity: "5000000",
            unit: "lovelace",
          },
        ],
        dataHash: datumHash,
        plutusData: datumCbor,
      },
    };

    const txHex =
      "84a700d90102818258201a6157c0c9e170d716aee64b25384cad275770e2ef86df31eeebda4892980723000183a300581d70506245b8d10428549499ecfcd0435d5a0b9a3aac2c5bccc824441a7201821a001e8480a1581ceab3a1d125a3bf4cd941a6a0b5d7752af96fae7f5bcc641e8a0b6762a14001028201d818586ad8799fd8799fd8799f5041bfc7325343428683bbd0b94a4da41cd8799f581ce1197f10e85bc4a3a812e34e22339e1df56b7fb6386a9510d7a304ffffd8799f581c7c87b6b5a0963af3eadb107da2ac4e1d34747a4df363858b649aa845ffffffa140a1401a00989680ff82581d70ba3efbd72650cbc7d5d7e6bede007cd3cb6730ba1972debf1c2c098f1a007a120082583900e1197f10e85bc4a3a812e34e22339e1df56b7fb6386a9510d7a304ff639277a22b3cf373f88423c584bacbbdf961e71500a591c042814e921b0000000253704b3f021a0003024109a1581ceab3a1d125a3bf4cd941a6a0b5d7752af96fae7f5bcc641e8a0b6762a140010b5820d88d41dd788fcf7c3b1f15808e11b01d71e0413d57265ddb7fc5b5776ff16e720dd9010281825820158a0bff150e9c6f68a14fdb1623c363f54e36cb22efc800911bffafa4e53442050ed9010281581cfa5136e9e9ecbc9071da73eeb6c9a4ff73cbf436105cf8380d1c525ca207d901028158b558b30101009800aba2a6011e581cfa5136e9e9ecbc9071da73eeb6c9a4ff73cbf436105cf8380d1c525c00a6010746332d6d696e740048c8c8c8c88c88966002646464646464660020026eb0c038c03cc03cc03cc03cc03cc03cc03cc03cc030dd5180718061baa0072259800800c52844c96600266e3cdd71808001005c528c4cc00c00c00500d1808000a01c300c300d002300b001300b002300900130063754003149a26cac8028dd7000ab9a5573caae7d5d0905a182010082d87980821956861a0066ad1cf5f6";

    await txParser.parse(txHex, [utxo1, utxo2]);
    const txTester = txParser.toTester();
    console.log(JSON.stringify(txTester.txBody, null, 2));

    txTester
      .inputsAt(
        "addr_test1qrs3jlcsapdufgagzt35ug3nncwl26mlkcux49gs673sflmrjfm6y2eu7del3pprckzt4jaal9s7w9gq5kguqs5pf6fq542mmq",
      )
      .inputsValue(
        MeshValue.fromAssets([{ unit: "lovelace", quantity: "10000000000" }]),
      )
      .outputsAt(
        "addr_test1qrs3jlcsapdufgagzt35ug3nncwl26mlkcux49gs673sflmrjfm6y2eu7del3pprckzt4jaal9s7w9gq5kguqs5pf6fq542mmq",
      )
      .outputsValue(
        MeshValue.fromAssets([{ unit: "lovelace", quantity: "9989802815" }]),
      )
      .outputsAt(
        "addr_test1wzara77hyegvh3746lntahsq0nfukeeshgvh9h4lrskqnrca6djna",
      )
      .outputsValue(
        MeshValue.fromAssets([{ unit: "lovelace", quantity: "8000000" }]),
      )
      .outputsAtWith(
        "addr_test1wpgxy3dc6yzzs4y5n8k0e5zrt4dqhx364sk9hnxgy3zp5usfh3tau",
        "eab3a1d125a3bf4cd941a6a0b5d7752af96fae7f5bcc641e8a0b6762",
      )
      .outputsInlineDatumExist(datumCbor)
      .tokenMinted(
        "eab3a1d125a3bf4cd941a6a0b5d7752af96fae7f5bcc641e8a0b6762",
        "",
        1,
      )
      .keySigned("fa5136e9e9ecbc9071da73eeb6c9a4ff73cbf436105cf8380d1c525c");

    console.log("Errors:", txTester.errors());
    expect(txTester.success()).toBe(true);
  });
});
