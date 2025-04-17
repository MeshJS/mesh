import JSONBig from "json-bigint";

import { NativeScript } from "@meshsdk/common";
import { applyCborEncoding } from "@meshsdk/core-csl";
import { CardanoSDKSerializer } from "@meshsdk/core-cst";

import { parseDatumCbor } from "../../src";

describe("Serialization utils", () => {
  const serializer = new CardanoSDKSerializer();

  it("serialize reward address", () => {
    expect(
      serializer.serializeRewardAddress(
        "e0464447c1f51adaefe1ebfb0dd485a349a70479ced1d198cbdf7fe7",
        false,
        0,
      ),
    ).toEqual(
      "stake_test1ursyv3z8c8634kh0u84lkrw5sk35nfcy088dr5vce00hlec3nfuma",
    );
  });

  it("serialize pool id", () => {
    expect(
      serializer.serializePoolId(
        "aef9b993cb2fea46cac0b7fe4f98426392f851792b39206567566029",
      ),
    ).toEqual("pool14mumny7t9l4ydjkqkllylxzzvwf0s5te9vujqet82eszj3d6ccm");
  });

  it("serialize data", () => {
    expect(
      serializer.serializeData({
        content: {
          constructor: 0,
          fields: [
            {
              constructor: 2,
              fields: [
                {
                  constructor: 0,
                  fields: [
                    {
                      constructor: 1,
                      fields: [
                        {
                          bytes:
                            "1a4c95cd8c6fc37e83914a5286358d530f99123806aa2f2c4d2b1fb7",
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              constructor: 2,
              fields: [
                {
                  constructor: 0,
                  fields: [
                    {
                      constructor: 1,
                      fields: [
                        {
                          bytes:
                            "213b5f66a7cbe034eeb26223940e256f9add1a526efc22be22517e39",
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              constructor: 0,
              fields: [
                {
                  constructor: 0,
                  fields: [
                    {
                      map: [
                        {
                          k: {
                            bytes: "30",
                          },
                          v: {
                            constructor: 0,
                            fields: [
                              {
                                bytes:
                                  "70c9a227cb5b55a221cfaca128b038f6f10e78f2015698781a296d52",
                              },
                            ],
                          },
                        },
                      ],
                    },
                  ],
                },
                {
                  constructor: 0,
                  fields: [
                    {
                      constructor: 0,
                      fields: [
                        {
                          bytes:
                            "1c4ef054932bafcb4a59810f31fa0ed001d6611066938d1a1aef1d1237c0a441",
                        },
                      ],
                    },
                    {
                      int: 0,
                    },
                  ],
                },
                {
                  constructor: 0,
                  fields: [
                    {
                      constructor: 1,
                      fields: [
                        {
                          bytes:
                            "6f9114681e5690c9293ade8f4a0f2856ab43d8d1b3397d4e3ae6b2c3",
                        },
                      ],
                    },
                    {
                      constructor: 1,
                      fields: [],
                    },
                  ],
                },
                {
                  constructor: 0,
                  fields: [
                    {
                      bytes:
                        "1cf9e87a5325a3f10afe0083bc6161f9b42298cd781fbaeb5d92c698",
                    },
                    {
                      bytes: "",
                    },
                  ],
                },
                {
                  constructor: 0,
                  fields: [
                    {
                      bytes:
                        "5ec37726eebe67f1db9f84e739b24e9e4dbb4c632a36a50ce74bfc86",
                    },
                    {
                      bytes: "55534441",
                    },
                  ],
                },
                {
                  constructor: 0,
                  fields: [
                    {
                      constructor: 1,
                      fields: [
                        {
                          bytes:
                            "84bbee03e9403e186817e6b24790370a5ea4a63489753d94a7ff5866",
                        },
                      ],
                    },
                    {
                      constructor: 1,
                      fields: [],
                    },
                  ],
                },
                {
                  constructor: 0,
                  fields: [
                    {
                      constructor: 0,
                      fields: [
                        {
                          bytes:
                            "f95cab9352c14782a366802b7967746a89356e8915c17006149ff68c",
                        },
                      ],
                    },
                    {
                      constructor: 1,
                      fields: [],
                    },
                  ],
                },
                {
                  int: 1,
                },
                {
                  int: 1,
                },
              ],
            },
          ],
        },
        type: "JSON",
      }),
    ).toEqual(
      "d8799fd87b9fd8799fd87a9f581c1a4c95cd8c6fc37e83914a5286358d530f99123806aa2f2c4d2b1fb7ffffffd87b9fd8799fd87a9f581c213b5f66a7cbe034eeb26223940e256f9add1a526efc22be22517e39ffffffd8799fd8799fa14130d8799f581c70c9a227cb5b55a221cfaca128b038f6f10e78f2015698781a296d52ffffd8799fd8799f58201c4ef054932bafcb4a59810f31fa0ed001d6611066938d1a1aef1d1237c0a441ff00ffd8799fd87a9f581c6f9114681e5690c9293ade8f4a0f2856ab43d8d1b3397d4e3ae6b2c3ffd87a80ffd8799f581c1cf9e87a5325a3f10afe0083bc6161f9b42298cd781fbaeb5d92c69840ffd8799f581c5ec37726eebe67f1db9f84e739b24e9e4dbb4c632a36a50ce74bfc864455534441ffd8799fd87a9f581c84bbee03e9403e186817e6b24790370a5ea4a63489753d94a7ff5866ffd87a80ffd8799fd8799f581cf95cab9352c14782a366802b7967746a89356e8915c17006149ff68cffd87a80ff0101ffff",
    );
  });

  it("parse datum cbor", () => {
    expect(
      JSONBig.stringify(
        parseDatumCbor(
          "d8799f00021a009896801a01312d00d8799fd8799f581c58b958963e49ba1815585497a7ca4683d1f8bb660915655dee9b50acffd8799fd8799fd8799f581c2c8559c6fdddc9044b50a494bd54c8de6eef4eaef046b851423c8cdfffffffff1a004c4b40ff",
        ),
      ),
    ).toEqual(
      JSONBig.stringify({
        constructor: 0,
        fields: [
          { int: 0 },
          { int: 2 },
          { int: 10000000 },
          { int: 20000000 },
          {
            constructor: 0,
            fields: [
              {
                constructor: 0,
                fields: [
                  {
                    bytes:
                      "58b958963e49ba1815585497a7ca4683d1f8bb660915655dee9b50ac",
                  },
                ],
              },
              {
                constructor: 0,
                fields: [
                  {
                    constructor: 0,
                    fields: [
                      {
                        constructor: 0,
                        fields: [
                          {
                            bytes:
                              "2c8559c6fdddc9044b50a494bd54c8de6eef4eaef046b851423c8cdf",
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          { int: 5000000 },
        ],
      }),
    );

    expect(
      JSONBig.stringify(
        parseDatumCbor(
          "d8799f9f4040ff9f581c5066154a102ee037390c5236f78db23239b49c5748d3d349f3ccf04b4455534458ffd87a801a3c3360801a02faf0800a581c4ba6dd244255995969d2c05e323686bcbaba83b736e729941825d79bff",
        ),
      ),
    ).toEqual(
      JSONBig.stringify({
        constructor: 0,
        fields: [
          {
            list: [
              {
                bytes: "",
              },
              {
                bytes: "",
              },
            ],
          },
          {
            list: [
              {
                bytes:
                  "5066154a102ee037390c5236f78db23239b49c5748d3d349f3ccf04b",
              },
              {
                bytes: "55534458",
              },
            ],
          },
          {
            constructor: 1,
            fields: [],
          },
          {
            int: 1010000000,
          },
          {
            int: 50000000,
          },
          {
            int: 10,
          },
          {
            bytes: "4ba6dd244255995969d2c05e323686bcbaba83b736e729941825d79b",
          },
        ],
      }),
    );
  });

  it("resolve private key", () => {
    expect(
      serializer.resolver.keys.resolvePrivateKey([
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
      ]),
    ).toEqual(
      "xprv19rumsw6emgv48dlcsthsk5z7a7008qp2wzf97cearz457pthd3wzyj6we3skrtv49ccezv3t25u4ykw5f3msgjs32cph5hrlf0gjkas458erpxveuznjq58sfg3v02mz820lnl9zf03hmaeca785d6kqsuyk403s",
    );
  });

  it("resolve reward address", () => {
    expect(
      serializer.resolver.keys.resolveRewardAddress(
        "addr_test1qql3kkt57ncf7zt5hej4un8ff79z6zra7dut08hnj9kzdv437u94wweqf3nftw8kd6mw03uv2hk7jscqyn47cm74lpwsju87pd",
      ),
    ).toEqual(
      "stake_test1uzclwz6h8vsyce54hrmxadh8c7x9tm0fgvqzf6lvdl2lshg5vr9cr",
    );
  });

  it("resolve ed25519 key hash", () => {
    expect(
      serializer.resolver.keys.resolveEd25519KeyHash(
        "addr_test1qql3kkt57ncf7zt5hej4un8ff79z6zra7dut08hnj9kzdv437u94wweqf3nftw8kd6mw03uv2hk7jscqyn47cm74lpwsju87pd",
      ),
    ).toEqual("3f1b5974f4f09f0974be655e4ce94f8a2d087df378b79ef3916c26b2");
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

  it("should deserialize pool id correctly", () => {
    const result = serializer.deserializer.cert.deserializePoolId(
      "pool1kgzq2g7glzcu76ygcl2llhamjjutcts5vhe2mzglmn5jxt2cnfs",
    );

    expect(result).toEqual(
      "b2040523c8f8b1cf6888c7d5ffdfbb94b8bc2e1465f2ad891fdce923",
    );
  });
});
