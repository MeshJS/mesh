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

  it.each(["RegisterStake", "DeregisterStake"] as const)(
    "preserves explicit %s amounts in the JSON adaptor",
    (type) => {
      for (const coin of [0, 3_000_000]) {
        const cert = {
          type: "BasicCertificate" as const,
          certType: { type, stakeKeyAddress, coin },
        };
        expect(certificateFromObj(certificateToObj(cert))).toEqual(cert);
      }
    },
  );
});
