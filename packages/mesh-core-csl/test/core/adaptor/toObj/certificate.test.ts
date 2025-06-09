import { Anchor, NativeScript } from "@meshsdk/common";
import { certificateToObj } from "@meshsdk/core-csl";
import { ForgeScript } from "@meshsdk/transaction";

describe("Certificate Adaptor - toObj", () => {
  test("Basic Certificate - RegisterStake", () => {
    const certObj = certificateToObj({
      type: "BasicCertificate",
      certType: {
        type: "RegisterStake",
        stakeKeyAddress:
          "stake_test17rvfqm99c7apyjsyq73jm2ehktyzkyanmnv3z8jzjsxuafq5a6z2j",
      },
    });

    expect(certObj).toEqual({
      basicCertificate: {
        registerStake: {
          coin: 2000000,
          stakeKeyAddress:
            "stake_test17rvfqm99c7apyjsyq73jm2ehktyzkyanmnv3z8jzjsxuafq5a6z2j",
        },
      },
    });
  });

  test("Basic Certificate - DelegateStake", () => {
    const certObj = certificateToObj({
      type: "BasicCertificate",
      certType: {
        type: "DelegateStake",
        stakeKeyAddress:
          "stake_test17rvfqm99c7apyjsyq73jm2ehktyzkyanmnv3z8jzjsxuafq5a6z2j",
        poolId: "pool1pu5jlj4q9w9jlxeu370a3c9myx47md5j5m2str0naunn2q3lkdy",
      },
    });

    expect(certObj).toEqual({
      basicCertificate: {
        delegateStake: {
          stakeKeyAddress:
            "stake_test17rvfqm99c7apyjsyq73jm2ehktyzkyanmnv3z8jzjsxuafq5a6z2j",
          poolId: "pool1pu5jlj4q9w9jlxeu370a3c9myx47md5j5m2str0naunn2q3lkdy",
        },
      },
    });
  });

  test("Basic Certificate - DeregisterStake", () => {
    const certObj = certificateToObj({
      type: "BasicCertificate",
      certType: {
        type: "DeregisterStake",
        stakeKeyAddress:
          "stake_test17rvfqm99c7apyjsyq73jm2ehktyzkyanmnv3z8jzjsxuafq5a6z2j",
      },
    });

    expect(certObj).toEqual({
      basicCertificate: {
        deregisterStake: {
          stakeKeyAddress:
            "stake_test17rvfqm99c7apyjsyq73jm2ehktyzkyanmnv3z8jzjsxuafq5a6z2j",
        },
      },
    });
  });

  test("Basic Certificate - VoteDelegation", () => {
    const certObj = certificateToObj({
      type: "BasicCertificate",
      certType: {
        type: "VoteDelegation",
        stakeKeyAddress:
          "stake_test17rvfqm99c7apyjsyq73jm2ehktyzkyanmnv3z8jzjsxuafq5a6z2j",
        drep: {
          dRepId: "drep1pu5jlj4q9w9jlxeu370a3c9myx47md5j5m2str0naunn2q3lkdy",
        },
      },
    });

    expect(certObj).toEqual({
      basicCertificate: {
        voteDelegation: {
          stakeKeyAddress:
            "stake_test17rvfqm99c7apyjsyq73jm2ehktyzkyanmnv3z8jzjsxuafq5a6z2j",
          drep: {
            dRepId: "drep1pu5jlj4q9w9jlxeu370a3c9myx47md5j5m2str0naunn2q3lkdy",
          },
        },
      },
    });
  });

  test("Basic Certificate - StakeAndVoteDelegation", () => {
    const certObj = certificateToObj({
      type: "BasicCertificate",
      certType: {
        type: "StakeAndVoteDelegation",
        stakeKeyAddress:
          "stake_test17rvfqm99c7apyjsyq73jm2ehktyzkyanmnv3z8jzjsxuafq5a6z2j",
        poolKeyHash: "pool1pu5jlj4q9w9jlxeu370a3c9myx47md5j5m2str0naunn2q3lkdy",
        drep: {
          dRepId: "drep1pu5jlj4q9w9jlxeu370a3c9myx47md5j5m2str0naunn2q3lkdy",
        },
      },
    });

    expect(certObj).toEqual({
      basicCertificate: {
        stakeAndVoteDelegation: {
          stakeKeyAddress:
            "stake_test17rvfqm99c7apyjsyq73jm2ehktyzkyanmnv3z8jzjsxuafq5a6z2j",
          poolKeyHash:
            "pool1pu5jlj4q9w9jlxeu370a3c9myx47md5j5m2str0naunn2q3lkdy",
          drep: {
            dRepId: "drep1pu5jlj4q9w9jlxeu370a3c9myx47md5j5m2str0naunn2q3lkdy",
          },
        },
      },
    });
  });

  test("Basic Certificate - RetirePool", () => {
    const certObj = certificateToObj({
      type: "BasicCertificate",
      certType: {
        type: "RetirePool",
        poolId: "pool1pu5jlj4q9w9jlxeu370a3c9myx47md5j5m2str0naunn2q3lkdy",
        epoch: 100,
      },
    });

    expect(certObj).toEqual({
      basicCertificate: {
        retirePool: {
          poolId: "pool1pu5jlj4q9w9jlxeu370a3c9myx47md5j5m2str0naunn2q3lkdy",
          epoch: 100,
        },
      },
    });
  });

  test("Basic Certificate - DRepRegistration", () => {
    let anchor: Anchor;

    const certObj = certificateToObj({
      type: "BasicCertificate",
      certType: {
        type: "DRepRegistration",
        drepId: "drep1pu5jlj4q9w9jlxeu370a3c9myx47md5j5m2str0naunn2q3lkdy",
        coin: 10000000,
        anchor: {
          anchorUrl: "https://example.com/metadata.json",
          anchorDataHash:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        },
      },
    });

    expect(certObj).toEqual({
      basicCertificate: {
        dRepRegistration: {
          drepId: "drep1pu5jlj4q9w9jlxeu370a3c9myx47md5j5m2str0naunn2q3lkdy",
          coin: 10000000,
          anchor: {
            anchorUrl: "https://example.com/metadata.json",
            anchorDataHash:
              "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
          },
        },
      },
    });
  });

  test("Script Certificate - DeregisterStake", () => {
    const certObj = certificateToObj({
      type: "ScriptCertificate",
      certType: {
        type: "DeregisterStake",
        stakeKeyAddress:
          "stake_test17rvfqm99c7apyjsyq73jm2ehktyzkyanmnv3z8jzjsxuafq5a6z2j",
      },
      redeemer: {
        data: {
          type: "CBOR",
          content: "d87980",
        },
        exUnits: { mem: 7000000, steps: 14000000 },
      },
      scriptSource: {
        type: "Provided",
        script: {
          code: "5251010000322253330034a229309b2b2b9a01",
          version: "V2",
        },
      },
    });

    expect(certObj).toEqual({
      scriptCertificate: {
        cert: {
          deregisterStake: {
            stakeKeyAddress:
              "stake_test17rvfqm99c7apyjsyq73jm2ehktyzkyanmnv3z8jzjsxuafq5a6z2j",
          },
        },
        redeemer: {
          data: "d87980",
          exUnits: { mem: 7000000, steps: 14000000 },
        },
        scriptSource: {
          providedScriptSource: {
            languageVersion: "v2",
            scriptCbor: "5251010000322253330034a229309b2b2b9a01",
          },
        },
      },
    });
  });

  test("SimpleScript Certificate - DelegateStake", () => {
    const nativeScript: NativeScript = {
      type: "all",
      scripts: [
        {
          type: "sig",
          keyHash: "e09d36c79dec9bd1b3d9e152247701cd0bb860b5ebfd1de8abb6735a",
        },
        {
          type: "sig",
          keyHash: "a687dcc24e00dd3caafbeb5e04fc4dfa6690ff9b28b7e445db8b69c3",
        },
      ],
    };
    const simpleScript = ForgeScript.fromNativeScript(nativeScript);

    const certObj = certificateToObj({
      type: "SimpleScriptCertificate",
      certType: {
        type: "DelegateStake",
        stakeKeyAddress:
          "stake_test17rvfqm99c7apyjsyq73jm2ehktyzkyanmnv3z8jzjsxuafq5a6z2j",
        poolId: "pool1pu5jlj4q9w9jlxeu370a3c9myx47md5j5m2str0naunn2q3lkdy",
      },
      simpleScriptSource: {
        type: "Provided",
        scriptCode: simpleScript,
      },
    });

    expect(certObj).toEqual({
      simpleScriptCertificate: {
        cert: {
          delegateStake: {
            stakeKeyAddress:
              "stake_test17rvfqm99c7apyjsyq73jm2ehktyzkyanmnv3z8jzjsxuafq5a6z2j",
            poolId: "pool1pu5jlj4q9w9jlxeu370a3c9myx47md5j5m2str0naunn2q3lkdy",
          },
        },
        simpleScriptSource: {
          providedSimpleScriptSource: {
            scriptCbor: simpleScript,
          },
        },
      },
    });
  });

  test("Basic Certificate - RegisterPool with pool params", () => {
    const certObj = certificateToObj({
      type: "BasicCertificate",
      certType: {
        type: "RegisterPool",
        poolParams: {
          vrfKeyHash:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
          operator: "pool_operator_1",
          pledge: "100000000",
          cost: "340000000",
          margin: [5, 100],
          relays: [
            {
              type: "SingleHostAddr",
              IPV4: "192.168.1.1",
              IPV6: "2001:0db8:85a3:0000:0000:8a2e:0370:7334",
              port: 3001,
            },
            {
              type: "SingleHostName",
              domainName: "relay1.example.com",
              port: 3001,
            },
          ],
          owners: ["owner1", "owner2"],
          rewardAddress:
            "stake_test1uqevw2xnsc0pvn9t9r9c7qryfqfeerchgrlm3ea2nefr9hqp8n5xl",
          metadata: {
            URL: "https://example.com/pool-metadata.json",
            hash: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
          },
        },
      },
    });

    expect(certObj).toEqual({
      basicCertificate: {
        registerPool: {
          poolParams: {
            vrfKeyHash:
              "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            operator: "pool_operator_1",
            pledge: "100000000",
            cost: "340000000",
            margin: [5, 100],
            relays: [
              {
                singleHostAddr: {
                  ipv4: "192.168.1.1",
                  ipv6: "2001:0db8:85a3:0000:0000:8a2e:0370:7334",
                  port: 3001,
                },
              },
              {
                singleHostName: {
                  hostname: "relay1.example.com",
                  port: 3001,
                },
              },
            ],
            owners: ["owner1", "owner2"],
            rewardAddress:
              "stake_test1uqevw2xnsc0pvn9t9r9c7qryfqfeerchgrlm3ea2nefr9hqp8n5xl",
            metadata: {
              url: "https://example.com/pool-metadata.json",
              metadata:
                "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            },
          },
        },
      },
    });
  });
});
