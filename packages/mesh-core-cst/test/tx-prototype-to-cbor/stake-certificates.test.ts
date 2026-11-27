import { certificateToPrototype } from "../../src/tx-prototype-from-cbor/certificates";
import { certificatePrototypeToCardano } from "../../src/tx-prototype-to-cbor/certificates";

const stake_credential = { type: "KEY" as const, value: "aa".repeat(28) };

describe("historical stake certificate round trips", () => {
  it.each(["STAKE_REGISTRATION", "STAKE_DEREGISTRATION"] as const)(
    "preserves both legacy and deposit-bearing %s",
    (type) => {
      for (const coin of [null, "0", "2000000"]) {
        const prototype = { type, value: { stake_credential, coin } };
        const cert = certificatePrototypeToCardano(prototype, 0);
        const legacyTag = type === "STAKE_REGISTRATION" ? 0 : 1;
        expect(cert.toCbor().slice(0, 4)).toBe(
          coin === null ? `820${legacyTag}` : `830${legacyTag + 7}`,
        );
        expect(certificateToPrototype(cert)).toEqual(prototype);
        expect(
          certificatePrototypeToCardano(
            certificateToPrototype(cert),
            0,
          ).toCbor(),
        ).toBe(cert.toCbor());
      }
    },
  );
});
