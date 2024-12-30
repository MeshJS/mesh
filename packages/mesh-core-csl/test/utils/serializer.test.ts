import { applyCborEncoding, NativeScript } from "@meshsdk/core";

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

  it("should return correct script reference v3", () => {
    const result = serializer.resolver.script.resolveScriptRef({
      version: "V3",
      code: applyCborEncoding(
        "5850010100323232323225333002323232323253330073370e900018041baa0011324a26eb8c028c024dd50008b1804980500198040011803801180380098021baa00114984d9595cd2ab9d5573cae855d11",
      ),
    });
    expect(result).toEqual(
      "d8185856820358525850010100323232323225333002323232323253330073370e900018041baa0011324a26eb8c028c024dd50008b1804980500198040011803801180380098021baa00114984d9595cd2ab9d5573cae855d11",
    );
  });

  it("should return correct script reference v2", () => {
    const result = serializer.resolver.script.resolveScriptRef({
      version: "V2",
      code: applyCborEncoding(
        "5850010100323232323225333002323232323253330073370e900018041baa0011324a26eb8c028c024dd50008b1804980500198040011803801180380098021baa00114984d9595cd2ab9d5573cae855d11",
      ),
    });
    expect(result).toEqual(
      "d8185856820258525850010100323232323225333002323232323253330073370e900018041baa0011324a26eb8c028c024dd50008b1804980500198040011803801180380098021baa00114984d9595cd2ab9d5573cae855d11",
    );
  });

  it("should return correct script reference v1", () => {
    const result = serializer.resolver.script.resolveScriptRef({
      version: "V1",
      code: applyCborEncoding(
        "5850010100323232323225333002323232323253330073370e900018041baa0011324a26eb8c028c024dd50008b1804980500198040011803801180380098021baa00114984d9595cd2ab9d5573cae855d11",
      ),
    });
    expect(result).toEqual(
      "d8185856820158525850010100323232323225333002323232323253330073370e900018041baa0011324a26eb8c028c024dd50008b1804980500198040011803801180380098021baa00114984d9595cd2ab9d5573cae855d11",
    );
  });

  it("should return correct script reference native", () => {
    const nativeScript: NativeScript = {
      type: "after",
      slot: "100",
    };
    const result = serializer.resolver.script.resolveScriptRef(nativeScript);
    expect(result).toEqual("d81846820082041864");
  });
});
