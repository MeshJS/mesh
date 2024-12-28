import { CSLSerializer } from "../../src/core/serializer";

describe("CSLSerializer", () => {
  let serializer: CSLSerializer;

  beforeEach(() => {
    serializer = new CSLSerializer();
  });

  describe("resolver", () => {
    describe("keys", () => {
      it("should resolve private key correctly", () => {
        const words = [
          "summer",
          "summer",
          "summer",
          "summer",
          "summer",
          "summer",
          "summer",
          "summer",
          "summer",
          "summer",
          "summer",
          "summer",
          "summer",
          "summer",
          "summer",
          "summer",
          "summer",
          "summer",
          "summer",
          "summer",
          "summer",
          "summer",
          "summer",
          "summer",
        ];
        const result = serializer.resolver.keys.resolvePrivateKey(words);
        expect(result).toEqual(
          "xprv19rumsw6emgv48dlcsthsk5z7a7008qp2wzf97cearz457pthd3wzyj6we3skrtv49ccezv3t25u4ykw5f3msgjs32cph5hrlf0gjkas458erpxveuznjq58sfg3v02mz820lnl9zf03hmaeca785d6kqsuyk403s",
        );
      });
    });
  });

  it("should hash datum correctly", () => {
    const datum = ["abc"];
    const result = serializer.resolver.data.resolveDataHash(datum);
    expect(result).toEqual(
      "b52368c053c76240d861f42024266d14939934a9a30799cfd315ac34f75072e4",
    );
  });
});
