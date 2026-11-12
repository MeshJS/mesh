import { emptyTxBuilderBody } from "@meshsdk/common";

import { certificateFromObj } from "../../src/core/adaptor/fromObj/certificate";
import { certificateToObj } from "../../src/core/adaptor/toObj/certificate";
import { CSLSerializer } from "../../src/core/serializer";

const stakeKeyAddress =
  "stake_test17rvfqm99c7apyjsyq73jm2ehktyzkyanmnv3z8jzjsxuafq5a6z2j";

describe("CSL stake certificate compatibility", () => {
  it.each(["RegisterStake", "DeregisterStake"] as const)(
    "rejects %s rather than silently emitting a legacy certificate",
    (type) => {
      const body = emptyTxBuilderBody();
      body.certificates.push({
        type: "BasicCertificate",
        certType: { type, stakeKeyAddress },
      });
      expect(() => new CSLSerializer().serializeTxBody(body)).toThrow(
        "use CardanoSDKSerializer (CST) instead",
      );
    },
  );

  it.each([
    ["RegisterStake", "registerStake"],
    ["DeregisterStake", "deregisterStake"],
  ] as const)("passes an explicit %s amount to whisky", (type, key) => {
    for (const coin of [0, 3_000_000]) {
      expect(
        certificateToObj({
          type: "BasicCertificate",
          certType: { type, stakeKeyAddress, coin },
        }),
      ).toEqual({ basicCertificate: { [key]: { stakeKeyAddress, coin } } });
    }
  });

  it("does not take the deposit whisky's parser reports for a stake registration", () => {
    // whisky's parser reports coin 0 for any stake registration's deposit
    expect(
      certificateFromObj({
        basicCertificate: { registerStake: { stakeKeyAddress, coin: 0 } },
      }),
    ).toEqual({
      type: "BasicCertificate",
      certType: { type: "RegisterStake", stakeKeyAddress },
    });
  });
});
