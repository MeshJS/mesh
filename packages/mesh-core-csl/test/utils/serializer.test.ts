import {
  applyCborEncoding,
  NativeScript,
  serializeData,
  stringToHex,
} from "@meshsdk/core";
import { CSLSerializer } from "@meshsdk/core-csl";

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

  describe("resolveDataHash", () => {
    it("Mesh - should return correct data", () => {
      expect(
        serializer.resolver.data.resolveDataHash("supersecretdatum"),
      ).toEqual(
        "d786b11f300b0a7b4e0fe7931eb7871fb7ed762c0a060cd1f922dfa631cafb8c",
      );
    });
    it("JSON - should return correct data", () => {
      expect(
        serializer.resolver.data.resolveDataHash(
          { bytes: stringToHex("supersecretdatum") },
          "JSON",
        ),
      ).toEqual(
        "d786b11f300b0a7b4e0fe7931eb7871fb7ed762c0a060cd1f922dfa631cafb8c",
      );
    });
    it("CBOR - should return correct data", () => {
      const cbor = serializeData("supersecretdatum", "Mesh");
      expect(serializer.resolver.data.resolveDataHash(cbor, "CBOR")).toEqual(
        "d786b11f300b0a7b4e0fe7931eb7871fb7ed762c0a060cd1f922dfa631cafb8c",
      );
    });
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
