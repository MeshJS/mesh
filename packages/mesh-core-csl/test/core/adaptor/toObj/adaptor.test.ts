import { mConStr0 } from "@meshsdk/common";
import { certificateToObj, withdrawalToObj } from "@meshsdk/core-csl";

describe("Adaptor", () => {
  test("Basic Certificate adaptor test", () => {
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

  test("Certificate deregister test", () => {
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

  test("Withdrawal test", () => {
    const withdrawalObj = withdrawalToObj({
      type: "ScriptWithdrawal",
      address:
        "stake_test17rvfqm99c7apyjsyq73jm2ehktyzkyanmnv3z8jzjsxuafq5a6z2j",
      coin: "0",
      scriptSource: {
        type: "Provided",
        script: {
          code: "5251010000322253330034a229309b2b2b9a01",
          version: "V2",
        },
      },
      redeemer: {
        data: {
          type: "Mesh",
          content: mConStr0([]),
        },
        exUnits: {
          mem: 2501,
          steps: 617656,
        },
      },
    });

    expect(withdrawalObj).toEqual({
      plutusScriptWithdrawal: {
        address:
          "stake_test17rvfqm99c7apyjsyq73jm2ehktyzkyanmnv3z8jzjsxuafq5a6z2j",
        coin: 0n,
        redeemer: { data: "d87980", exUnits: { mem: 2501, steps: 617656 } },
        scriptSource: {
          providedScriptSource: {
            languageVersion: "v2",
            scriptCbor: "5251010000322253330034a229309b2b2b9a01",
          },
        },
      },
    });
  });
});
