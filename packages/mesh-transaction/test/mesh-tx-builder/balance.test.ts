import { MeshTxBuilderBody } from "@meshsdk/common";
import { OfflineEvaluator } from "@meshsdk/core-csl";
import { Transaction, TxCBOR } from "@meshsdk/core-cst";
import { BlockfrostProvider, OfflineFetcher } from "@meshsdk/provider";
import { MeshTxBuilder } from "@meshsdk/transaction";

import { calculateOutputLovelaces, txHash } from "../test-util";

describe("MeshTxBuilder", () => {
  let txBuilder: MeshTxBuilder;

  beforeEach(() => {
    txBuilder = new MeshTxBuilder();
  });

  // it("Should add remaining value as fees if insufficient for minUtxoValue", async () => {
  //   const tx = await txBuilder
  //     .txIn(
  //       txHash("tx0"),
  //       0,
  //       [
  //         {
  //           unit: "lovelace",
  //           quantity: "1200000",
  //         },
  //       ],
  //       "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
  //       0,
  //     )
  //     .txOut(
  //       "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
  //       [
  //         {
  //           unit: "lovelace",
  //           quantity: "1000000",
  //         },
  //       ],
  //     )
  //     .changeAddress(
  //       "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
  //     )
  //     .complete();
  //
  //   const cardanoTx = Transaction.fromCbor(TxCBOR(tx));
  //   expect(cardanoTx.body().fee()).toEqual(BigInt(200000));
  //   expect(calculateOutputLovelaces(tx)).toEqual(BigInt(1000000));
  // });

  it("Transaction should be exactly balanced with change output", async () => {
    const tx = await txBuilder
      .txIn(
        txHash("tx0"),
        0,
        [
          {
            unit: "lovelace",
            quantity: "3000000",
          },
        ],
        "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
        0,
      )
      .txOut(
        "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
        [
          {
            unit: "lovelace",
            quantity: "1000000",
          },
        ],
      )
      .changeAddress(
        "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
      )
      .complete();
    const cardanoTx = Transaction.fromCbor(TxCBOR(tx));
    expect(calculateOutputLovelaces(tx) + cardanoTx.body().fee()).toEqual(
      BigInt(3000000),
    );
    expect(cardanoTx.body().outputs().length).toEqual(2);
  });

  it("Transaction without enough lovelaces for fees should throw error", async () => {
    await expect(
      txBuilder
        .txIn(
          txHash("tx0"),
          0,
          [
            {
              unit: "lovelace",
              quantity: "1000000",
            },
          ],
          "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
          0,
        )
        .txOut(
          "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
          [
            {
              unit: "lovelace",
              quantity: "900000",
            },
          ],
        )
        .changeAddress(
          "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
        )
        .complete(),
    ).rejects.toThrow("UTxO Fully Depleted");
  });

  it("Transaction should balance even when outputs don't have lovelaces", async () => {
    const fetcher = new OfflineFetcher("preprod");

    fetcher.addUTxOs([
      {
        input: {
          txHash:
            "a4f8080e8e34992977fae292c0f5d843c6c78f837fa69c624e66b6aab868745e",
          outputIndex: 0,
        },
        output: {
          amount: [
            { unit: "lovelace", quantity: "1241280" },
            {
              unit: "c76c35088ac826c8a0e6947c8ff78d8d4495789bc729419b3a33430520",
              quantity: "1",
            },
          ],
          address:
            "addr_test1xrrkcdgg3tyzdj9qu628erlh3kx5f9tcn0rjjsvm8ge5xpvke8x9mpjf7aerjt3n3nfd5tnzkfhlprp09mpf4sdy8dzqs6wq6p",
        },
      },
      {
        input: {
          txHash:
            "67b37a5089df9e785aa9c22ac68788e870d8dde85d1df66f2cbbe86721ecd9a0",
          outputIndex: 0,
        },
        output: {
          amount: [{ unit: "lovelace", quantity: "100000000" }],
          address:
            "addr_test1qqa9lwdqap8qm9desuq783a5g0xuseuvrkjjd775ajk5ktvjc8vghyqzuh2suqp2rf0e35zx9rjhkqmpq8tmx9q0zq5ssffpud",
        },
      },
      {
        input: {
          txHash:
            "70f7f43ead6d2e4bb7c41ccda408dfc23c29c3493560a9ebb7005c051ffb7e65",
          outputIndex: 0,
        },
        output: {
          amount: [{ unit: "lovelace", quantity: "5000000" }],
          address:
            "addr_test1qqa9lwdqap8qm9desuq783a5g0xuseuvrkjjd775ajk5ktvjc8vghyqzuh2suqp2rf0e35zx9rjhkqmpq8tmx9q0zq5ssffpud",
        },
      },
      {
        input: {
          txHash:
            "4df3ebc0592b39124c5cc3a1cf680a5d7ac393531dd308e34ee499fbad7257e7",
          outputIndex: 7,
        },
        output: {
          amount: [
            {
              unit: "lovelace",
              quantity: "13391170",
            },
            {
              unit: "3ff4fba4491339dc471538763a7d87df527757473a0c70b017400730496e64657853637269707473",
              quantity: "1",
            },
          ],
          address:
            "addr_test1xqzp3cel9p95shlsaertqrt0wcmym5y780ljmca80k4u8ruke8x9mpjf7aerjt3n3nfd5tnzkfhlprp09mpf4sdy8dzqdxy5xn",
          plutusData:
            "d8799fd8799fd8799f581c78e4d6294634e3472d53f1a7236ad7967a90266e1ea00db3902ce42fffd8799fd8799fd8799f581ce6edaec7254d30a009e38970c7de292bdb3c5b5e8df95b20565f244dffffffffd879809fd8799f40401a004c4b40ffff9fd87a9f581c3cd70530341026cdd03d8d38f53d5993503bf125f2dad58edd377c99ffffff",
          scriptRef:
            "590a7401010033232323232323232323232323232323232323232323232322290029111919192c99192a999ab9a3370e90000008899191919191919191919191919480bc88c8a403e444644652601001d223255333573466e1d2006330260044800044c964cc005301024120004c010101008ac998009ba93371491103313030000184c10101008ac998009ba93371491103323232000184c10101008ac9803808c4c8c964c008cc00401806a2b260046600203400b15955333573466e4001806844ccd5cd19b9001a005800400846005133011008480023002460048c0084466e95200433574066e9520003357406ea4008cd5d01ba90014bd7025eb808cc0f88954ccd5cd1aba300111611325955333573466ebcd5d09aab9e375400200c22666ae68cdd798168008024002004230028aa999ab9a3375e980103d87a8000302e00111325932593300101d4c1024120008c0022660020269801024120001818000c4ccd5cd19b8748010cc0ac0052000800400a3002181f80088c00a260066ae880086ae8400404a3002460048c00918010c0c0010460046604c02a01233028375601c024606c44aa666ae68d5d180088b08992a999ab9a3375e6ae84d55cf1baa0010061132593302b0050018aa999ab9a3370e66046002900019816002a400022aa666ae68cdd7a6103d87a8000302700211333573466ebc018c09800a0010021180108c00a3002181b8008898019aba2002357420023031225533357346ae8c00445844c8c96564cc00403d301024120008c00226600200a98010241200044c8c8c954ccd5cd19b8748000008460026eb8d5d0800cdd71aba13574400211635573c0046aae74004dd51aba135573c6ea8c0b800a260086ae8800c60446eacc0c0004d5d08008c0b88896400a2666ae68cdc3a4004003000801488564cc09801800a26600a00266e01200200389980280080186eacd5d09aba23574400860420266eb0d5d08049aba1001357440026ae88004d5d10021aba135573c00c6eb8d5d0803180f99980e1bac357420020149810d4c496e646578536372697074730035744002603001222aa666ae68cdc3a400400222646660246ae84d55cf1baa357426aae78dd51aba135573c6ea8d5d09aba235573c6ea8cc068dd61aba1001357426aae7800cdd59aba1357446ae88d5d11aba2357446ae88d5d11aba2357440029000180c00488aa999ab9a3370e90020008899191919194807c88a401e446464446600601697ae0302d22232325533357346ae8c01044cc0040312f5c02264b2aa666ae68cdd79aba135573c6ea8004cc078dd480780508992c9804000c554ccd5cd19b8748010cc074005200011333573466ebd300103d87a8000302100280040084600518010c0c4004460051330063574400a66ae8000401226600c6ae880140106ae84010c0c4888c954ccd5cd1aba3003115930010108980280146004113259300a375660640031330053574400866ae80d5d09aba235573c6ea800400e26600a6ae8801000c6ae8400cc0d088c8c954ccd5cd1aba3003116113255333573466ebcd5d09aab9e375400201e2264aa666ae68cdc419981c800a6010140004c0101400033702006008230021155333573466ebcc09800803c4554ccd5cd19baf4c103d87a8000302700211333573466e1d200233024001480020010021180108c008c0dc00444c014d5d10021aba10033303400448000cc0cc01d20003030225533357346ae8c00446000226464646606a44aa666ae68d5d180088b08992a999ab9a3375e604800200a22aa666ae68cdc419981b981b000a6010140004c010140003330370044c10140004c010140001130083574400e22c2260066ae88008d5d08008031819001180f8009aba100125933301b0010054c01024120008c0022666ae68cdc3a40046660580026ea402530010241200080040081bac3574200860340186eb8d5d09aab9e37546ae84d55cf002180f19980d9bac357426ae880040253010d4c496e646578536372697074730030180091155333573466e1d20060011180008b1aab9d00137546ae84d5d1000c5268b0d5d10009aab9e001375400830172225533357346ae8c008440044554ccd5cd19b8748008cc010dd59aab9e35742004900008998019aba200233700900100088b180b1112a999ab9a357460042200222660066ae88008cdc0240040024466e95200032335740600200666ae80cdd2a400066ae80cdd2a400066ae80c0040092f5c097ae04bd70119ba548008cd5d0000a5eb808d5d09aba2357446aae78dd500091aba1357446ae88d5d11aab9e3754002444666ae68cdc3a4004666028006004003000801180891112a999ab9a3574600422666ae68cdc3a4004003000801089919192a999ab9a3375e00266e952000002113330070063574400a66e0120020041155333573466ebc004cdd2a400866ae80cdd2a400400497ae0113330070063574400a66e012002004113330070063574400a0086aae74008cd5d000225eb80d5d080118081112a999ab9a3574600422c2264aa666ae68cdd79aab9d0010021137566aae7800444cc010d5d10018011aba1002300f222590028c00244265200722255333573466e2001000445844cc02401401c6660260072005222375200690029111ba90020c0388896400a2003221330050013370090010018c03488954ccd5cd1aba30021180108aa999ab9a3375e6aae74d5d080100088c00044cc00cd5d1001000980611112a999ab9a3574600622c2264aa666ae68cdd79aab9d00100311333573466ebcd55cf00080140020042266600a6ae8801000c008d5d080191bac357426ae88d5d1180100091aab9e37546ae84d55cf1baa00130092225533357346ae8c00845844c954ccd5cd19baf357426aae78dd50008010880088998021aba2003002357420044446ae84d55cf1baa30043330050030020012357426ae88d5d11aab9e37546ae84d5d11aab9e3754002600c4444aa666ae68d5d180188b08992a999ab9a3370e90011998051bab30070010030021100111333005357440080060046ae8400c8c8c8c954ccd5cd19b874800000844c8c8ca0026ae840126ae8400e660024646464aa666ae68cdc3a40000042265001375c6ae8400a6eb8d5d0800cdd69aba1357440023574400222c6aae78008d55ce8009baa00135742005330012001357426ae88008464460046eb0004c03088cccd55cf80094000a00660086ae8400a60066ae88009000357440026ae88004458d55cf0011aab9d001375400246ae84d5d11aab9e37546ae84d5d11aab9e37540026006444aa666ae68d5d18010880088998019aba20023370066600a60086ae840093010140004c01014000001237566ae84d5d11aab9e3754002444646600a44aa666ae68d5d180088a40002264aa666ae68cdd79aab9d00100611300437566aae7800444c00cd5d10011aba10010043004225533357346ae8c004452000113255333573466ebcd55ce800802089bad35573c0022260066ae88008d5d080091918008009180111980100100099999a891001111400400e005001109480140049811e581c3ff4fba4491339dc471538763a7d87df527757473a0c70b017400730004c011e581c123f0263f0bd818fb43bdba5362e72bcb594e2b48265a8a7ef93fe07004c011e581c96c9cc5d8649f772392e338cd2da2e62b26ff08c2f2ec29ac1a43b440001",
        },
      },
      {
        input: {
          txHash:
            "8a3a9c393bec05d40b73ed459a10a5c9c7a11f197c88d1aaca48080a2e48e7c5",
          outputIndex: 1,
        },
        output: {
          address:
            "addr_test1qrk3ahz8vfyudwxzkk900vyh4kwvvkupezuztxs2uhxegx33r7tjl95j976frv930fsr4e3fnzff66tglgwjzva3f8vsas3rxn",
          amount: [
            {
              unit: "lovelace",
              quantity: "4111740",
            },
          ],
          scriptRef:
            "5902c9010100332323232322232323259323255333573466e1d20040011132329009914802488c8c8c8c954ccd5cd19baf3574200200e226464aa666ae68cdd79aba10010051155333573466ebd30103d87a8000357426ae8800444ccd5cd19b8748010cc050dd59aba1002480020010021180108c008d5d10009aba2001118011aab9e001375400466e95200433574066e9520003357406ea4dd700299aba0375200666ae80dd39808c000cd5d000125eb812f5c066601e00a0086ea4cdc5244103313030000020dd61aba1357446ae88d55cf1baa3574200a646464aa666ae68cdc3a400000423001375c6ae840066ae84d5d10008458d55cf0011aab9d00137546ae8400c4554ccd5cd19b87480180044600022c6aae74004dd51aba135744003149a2c357440026aae78004dd500098021112a999ab9a357460042200222660066ae88008cdc024004002600644446464aa666ae68d5d180288b08992a999ab9a3370e900118011bab357426ae88d55cf1baa00111001113330073574400c00a0086ae84014c0208954ccd5cd1aba3001114800044c954ccd5cd19baf35573a00200c2260086eacd55cf0008898019aba200235742002600e44aa666ae68d5d180088a40002264aa666ae68cdd79aab9d00100411375a6aae7800444c00cd5d10011aba10013002229001a5eb824466ae82400a44466e9520003357406ea400ccd5d01ba73008002335740b200314c0103d87a80008a6103d879800025eb8060080023001229001a5eb824466ae80dd4801180200088c8c0040048c0088cc008008004cccd44880088a002005001109480140049811e581cc76c35088ac826c8a0e6947c8ff78d8d4495789bc729419b3a334305004c0150d8799fd87a9f581cfc683d569387e6452300cd5c9b3d1d9b49ecd4ec2f714254fc672ef8ffd8799fd8799fd87a9f581c96c9cc5d8649f772392e338cd2da2e62b26ff08c2f2ec29ac1a43b44ffffffff0001",
        },
      },
    ]);

    const txBody: Partial<MeshTxBuilderBody> = {
      inputs: [
        {
          type: "Script",
          txIn: {
            txHash:
              "a4f8080e8e34992977fae292c0f5d843c6c78f837fa69c624e66b6aab868745e",
            txIndex: 0,
            amount: [
              { unit: "lovelace", quantity: "1241280" },
              {
                unit: "c76c35088ac826c8a0e6947c8ff78d8d4495789bc729419b3a33430520",
                quantity: "1",
              },
            ],
            address:
              "addr_test1xrrkcdgg3tyzdj9qu628erlh3kx5f9tcn0rjjsvm8ge5xpvke8x9mpjf7aerjt3n3nfd5tnzkfhlprp09mpf4sdy8dzqs6wq6p",
            scriptSize: 0,
          },
          scriptTxIn: {
            datumSource: {
              type: "Inline",
              txHash:
                "a4f8080e8e34992977fae292c0f5d843c6c78f837fa69c624e66b6aab868745e",
              txIndex: 0,
            },
            scriptSource: {
              type: "Inline",
              txHash:
                "4df3ebc0592b39124c5cc3a1cf680a5d7ac393531dd308e34ee499fbad7257e7",
              txIndex: 7,
              scriptHash:
                "c76c35088ac826c8a0e6947c8ff78d8d4495789bc729419b3a334305",
              version: "V3",
              scriptSize: "2684",
            },
            redeemer: {
              data: { type: "JSON", content: '{"constructor":0,"fields":[]}' },
              exUnits: { mem: 86660, steps: 29884994 },
            },
          },
        },
      ],
      outputs: [
        {
          address:
            "addr_test1qpuwf43fgc6wx3ed20c6wgm267t84ypxdc02qrdnjqkwgtlxakhvwf2dxzsqncufwrrau2ftmv79kh5dl9djq4jly3xspgyfcz",
          amount: [{ unit: "lovelace", quantity: "5000000" }],
        },
        {
          address:
            "addr_test1xrrkcdgg3tyzdj9qu628erlh3kx5f9tcn0rjjsvm8ge5xpvke8x9mpjf7aerjt3n3nfd5tnzkfhlprp09mpf4sdy8dzqs6wq6p",
          amount: [
            {
              unit: "c76c35088ac826c8a0e6947c8ff78d8d4495789bc729419b3a33430520",
              quantity: "1",
            },
          ],
          datum: {
            type: "Inline",
            data: {
              type: "JSON",
              content:
                '{"constructor":0,"fields":[{"bytes":"67656e65736973"},{"bytes":"676f64"}]}',
            },
          },
        },
        {
          address:
            "addr_test1xrrkcdgg3tyzdj9qu628erlh3kx5f9tcn0rjjsvm8ge5xpvke8x9mpjf7aerjt3n3nfd5tnzkfhlprp09mpf4sdy8dzqs6wq6p",
          amount: [
            {
              unit: "c76c35088ac826c8a0e6947c8ff78d8d4495789bc729419b3a33430520",
              quantity: "1",
            },
          ],
          datum: {
            type: "Inline",
            data: {
              type: "JSON",
              content:
                '{"constructor":0,"fields":[{"bytes":"676f64"},{"bytes":"67756c6c6130"}]}',
            },
          },
        },
        {
          address:
            "addr_test1xr7xs02kjwr7v3frqrx4exearkd5nmx5ashhzsj5l3nja7yke8x9mpjf7aerjt3n3nfd5tnzkfhlprp09mpf4sdy8dzq6ptcdp",
          amount: [
            {
              unit: "c76c35088ac826c8a0e6947c8ff78d8d4495789bc729419b3a334305313030676f64",
              quantity: "1",
            },
          ],
          datum: {
            type: "Inline",
            data: {
              type: "JSON",
              content:
                '{"constructor":0,"fields":[{"bytes":"c76c35088ac826c8a0e6947c8ff78d8d4495789bc729419b3a334305"},{"bytes":"676f64"},{"list":[]},{"bytes":"20"}]}',
            },
          },
        },
      ],
      collaterals: [
        {
          type: "PubKey",
          txIn: {
            txHash:
              "70f7f43ead6d2e4bb7c41ccda408dfc23c29c3493560a9ebb7005c051ffb7e65",
            txIndex: 0,
            amount: [{ unit: "lovelace", quantity: "5000000" }],
            address:
              "addr_test1qqa9lwdqap8qm9desuq783a5g0xuseuvrkjjd775ajk5ktvjc8vghyqzuh2suqp2rf0e35zx9rjhkqmpq8tmx9q0zq5ssffpud",
            scriptSize: 0,
          },
        },
      ],
      requiredSignatures: [],
      referenceInputs: [],
      mints: [
        {
          type: "Plutus",
          policyId: "c76c35088ac826c8a0e6947c8ff78d8d4495789bc729419b3a334305",
          scriptSource: {
            type: "Inline",
            txHash:
              "4df3ebc0592b39124c5cc3a1cf680a5d7ac393531dd308e34ee499fbad7257e7",
            txIndex: 7,
            version: "V3",
            scriptSize: "2684",
            scriptHash:
              "c76c35088ac826c8a0e6947c8ff78d8d4495789bc729419b3a334305",
          },
          redeemer: {
            data: { type: "JSON", content: '{"bytes":"676f64"}' },
            exUnits: { mem: 474805, steps: 166687990 },
          },
          mintValue: [
            { assetName: "20", amount: "1" },
            { assetName: "313030676f64", amount: "1" },
            { assetName: "323232676f64", amount: "1" },
          ],
        },
      ],
      changeAddress:
        "addr_test1qqa9lwdqap8qm9desuq783a5g0xuseuvrkjjd775ajk5ktvjc8vghyqzuh2suqp2rf0e35zx9rjhkqmpq8tmx9q0zq5ssffpud",
      metadata: new Map(),
      validityRange: {},
      certificates: [],
      withdrawals: [
        {
          type: "ScriptWithdrawal",
          address:
            "stake_test17q7dwpfsxsgzdnws8kxn3afatxf4qwl3yhed44vwm5mhexgr3a09v",
          coin: "0",
          scriptSource: {
            type: "Inline",
            txHash:
              "8a3a9c393bec05d40b73ed459a10a5c9c7a11f197c88d1aaca48080a2e48e7c5",
            txIndex: 1,
            scriptHash:
              "3cd70530341026cdd03d8d38f53d5993503bf125f2dad58edd377c99",
            version: "V3",
            scriptSize: "721",
          },
          redeemer: {
            data: {
              type: "JSON",
              content:
                '{"constructor":0,"fields":[{"bytes":"676f64"},{"bytes":"20"}]}',
            },
            exUnits: { mem: 146930, steps: 51719571 },
          },
        },
      ],
      votes: [],
      signingKey: [],
      chainedTxs: [],
      inputsForEvaluation: {
        "67b37a5089df9e785aa9c22ac68788e870d8dde85d1df66f2cbbe86721ecd9a00": {
          input: {
            outputIndex: 0,
            txHash:
              "67b37a5089df9e785aa9c22ac68788e870d8dde85d1df66f2cbbe86721ecd9a0",
          },
          output: {
            address:
              "addr_test1qqa9lwdqap8qm9desuq783a5g0xuseuvrkjjd775ajk5ktvjc8vghyqzuh2suqp2rf0e35zx9rjhkqmpq8tmx9q0zq5ssffpud",
            amount: [{ unit: "lovelace", quantity: "100000000" }],
          },
        },
      },
      network: "mainnet",
      expectedNumberKeyWitnesses: 0,
      expectedByronAddressWitnesses: [],
      extraInputs: [
        {
          input: {
            txHash:
              "67b37a5089df9e785aa9c22ac68788e870d8dde85d1df66f2cbbe86721ecd9a0",
            outputIndex: 0,
          },
          output: {
            amount: [{ unit: "lovelace", quantity: "100000000" }],
            address:
              "addr_test1qqa9lwdqap8qm9desuq783a5g0xuseuvrkjjd775ajk5ktvjc8vghyqzuh2suqp2rf0e35zx9rjhkqmpq8tmx9q0zq5ssffpud",
          },
        },
      ],
    };
    const newTxBuilder = new MeshTxBuilder({ fetcher });
    const txHex = await newTxBuilder.complete(txBody);
    const cardanoTx = Transaction.fromCbor(TxCBOR(txHex));
    console.log(txHex);
    expect(calculateOutputLovelaces(txHex) + cardanoTx.body().fee()).toEqual(
      BigInt(1241280) + BigInt(100000000),
    );
  });
});
