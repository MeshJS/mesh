import {
  NativeScript,
  PlutusScript,
  resolveFingerprint,
} from "@meshsdk/common";
import {
  resolveDataHash,
  resolveNativeScriptAddress,
  resolveNativeScriptHash,
  resolvePaymentKeyHash,
  resolvePlutusScriptAddress,
  resolvePlutusScriptHash,
  resolveRewardAddress,
  resolveStakeKeyHash,
} from "@meshsdk/core-cst";

describe("resolveDataHash", () => {
  it("should return correct data", () => {
    expect(resolveDataHash("supersecretdatum")).toEqual(
      "d786b11f300b0a7b4e0fe7931eb7871fb7ed762c0a060cd1f922dfa631cafb8c",
    );
  });
});

describe("resolveFingerprint", () => {
  it("should return correct data", () => {
    expect(
      resolveFingerprint(
        "426117329844ccb3b0ba877220ff06a5bdf21eab3fb33e2f3a3f8e69",
        "4d657368546f6b656e",
      ),
    ).toEqual("asset1w7z7f29z9pxy6epred5j2a0vsc69nllw8tcpf6");
  });
});

describe("resolveNativeScriptAddress", () => {
  it("should return correct data", () => {
    const keyHash = resolvePaymentKeyHash(
      "addr1v9vx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0c93pyfx",
    );
    const nativeScript: NativeScript = {
      type: "all",
      scripts: [
        {
          type: "sig",
          keyHash: keyHash,
        },
      ],
    };
    expect(resolveNativeScriptAddress(nativeScript, 1)).toEqual(
      "addr1w8m53kq6d06vrah40nux9qqhjqd8xcu686u60wm8x25vpjg6eys0w",
    );
  });
});

describe("resolveNativeScriptHash", () => {
  it("should return correct data", () => {
    const keyHash = resolvePaymentKeyHash(
      "addr1v9vx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0c93pyfx",
    );
    const nativeScript: NativeScript = {
      type: "all",
      scripts: [
        {
          type: "sig",
          keyHash: keyHash,
        },
      ],
    };
    expect(resolveNativeScriptHash(nativeScript)).toEqual(
      "f748d81a6bf4c1f6f57cf8628017901a73639a3eb9a7bb6732a8c0c9",
    );
  });
});

describe("resolvePaymentKeyHash", () => {
  it("should return correct data", () => {
    expect(
      resolvePaymentKeyHash(
        "addr_test1vpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0c7e4cxr",
      ),
    ).toEqual("5867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f");
  });
});

describe("resolvePlutusScriptAddress", () => {
  it("should return correct data", () => {
    const script: PlutusScript = {
      code: "4e4d01000033222220051200120011",
      version: "V1",
    };

    expect(resolvePlutusScriptAddress(script, 0)).toEqual(
      "addr_test1wpnlxv2xv9a9ucvnvzqakwepzl9ltx7jzgm53av2e9ncv4sysemm8",
    );
  });
});

describe("resolvePlutusScriptHash", () => {
  it("should return correct data", () => {
    expect(
      resolvePlutusScriptHash(
        "addr_test1wpnlxv2xv9a9ucvnvzqakwepzl9ltx7jzgm53av2e9ncv4sysemm8",
      ),
    ).toEqual("67f33146617a5e61936081db3b2117cbf59bd2123748f58ac9678656");
  });
});

// todo: unimplemented
// describe("resolvePrivateKey", () => {
//   it("should return correct data", () => {
//     expect(
//       resolvePrivateKey("solution,".repeat(24).split(",").slice(0, 24)),
//     ).toEqual(
//       "xprv1cqa46gk29plgkg98upclnjv5t425fcpl4rgf9mq2txdxuga7jfq5shk7np6l55nj00sl3m4syzna3uwgrwppdm0azgy9d8zahyf32s62klfyhe0ayyxkc7x92nv4s77fa0v25tufk9tnv7x6dgexe9kdz5gpeqgu",
//     );
//   });
// });

describe("resolveRewardAddress", () => {
  it("should return correct data", () => {
    expect(
      resolveRewardAddress(
        "addr_test1qzl2r3fpmav0fmh0vrry0e0tmzxxqwv32sylnlty2jj8dwg636sfudakhsh65qggs4ttjjsk8fuu3fkd65uaxcxv0tfqv3z0y3",
      ),
    ).toEqual(
      "stake_test1uqdgagy7x7mtcta2qyyg244efgtr57wg5mxa2wwnvrx845s4sa2vp",
    );
  });
});

describe("resolveStakeKeyHash", () => {
  it("should return correct data", () => {
    expect(
      resolveStakeKeyHash(
        "stake1u93r8fsv43jyuw84yv4xwzfmka5sms5u5karqjysw2jszaq2kapyl",
      ),
    ).toEqual("6233a60cac644e38f5232a67093bb7690dc29ca5ba30489072a50174");
  });
});
