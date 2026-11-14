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

  it("should deserialize plutus script with the ledger script hash", () => {
    // Aiken blueprint vector (giftcard redeem validator, Plutus V3): the
    // hash must be taken over the serialised script bytes, not the
    // CBOR-unwrapped bytes (see MeshJS/mesh#763).
    const result = serializer.deserializer.script.deserializePlutusScript({
      code: "59011501010032323232323232232232253330063232323232533300b3370e900118061baa001132323232325333013301600213253330113370e6eb4c04c009200113371e00201e2940dd718088008b180a00099299980799b8748008c040dd50008a5eb7bdb1804dd5980a18089baa001323300100137566028602a602a602a602a60226ea8020894ccc04c004530103d87a80001323232325333014337220200042a66602866e3c0400084cdd2a4000660306e980052f5c02980103d87a80001330060060033756602a0066eb8c04c008c05c008c054004c048c04c008c044004c034dd50008b1807980800118070009807001180600098041baa00114984d958dd70009bae0015734aae7555cf2ab9f5740ae855d101",
      version: "V3",
    });
    expect(result.scriptHash).toEqual(
      "b2386630f1b210c58d0e46f132e931b362c3f373685118018e4d956f",
    );
  });
});
