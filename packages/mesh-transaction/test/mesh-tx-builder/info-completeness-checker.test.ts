import { Asset, mConStr0, MintParam, NativeScript } from "@meshsdk/common";
import { resolveNativeScriptHash, serializePlutusScript } from "@meshsdk/core";
import { MeshTxBuilder } from "@meshsdk/transaction";

import {
  alwaysSucceedCbor,
  alwaysSucceedHash,
  baseAddress,
  txHash,
} from "../test-util";

/**
 * What the body must state of an output for the builder to do without a fetcher: `complete()`
 * builds on the data the calls declare, and refuses what it would have to read
 * (MISSING_FETCHER); the sync methods need less, and refuse what they cannot assemble
 * (UNRESOLVED).
 */

const lovelace = (quantity: string): Asset[] => [
  { unit: "lovelace", quantity },
];
const scriptAddress = serializePlutusScript({
  code: alwaysSucceedCbor,
  version: "V3",
}).address;
const native: NativeScript = { type: "all", scripts: [] };
const scriptSize = "100";

type Declared = { amount?: Asset[]; address?: string; scriptSize?: number };

/** A key input with what is declared of it */
const keyInput = ({ amount, address, scriptSize }: Declared) =>
  new MeshTxBuilder()
    .txIn(txHash("key"), 0, amount, address, scriptSize)
    .changeAddress(baseAddress(0));

/** A Plutus input with what is declared of it, and a declared collateral */
const scriptInput = ({ amount, address, scriptSize }: Declared) =>
  new MeshTxBuilder()
    .spendingPlutusScriptV3()
    .txIn(txHash("script"), 0, amount, address, scriptSize)
    .txInInlineDatumPresent()
    .txInRedeemerValue(mConStr0([]))
    .txInScript(alwaysSucceedCbor)
    .txInCollateral(
      txHash("collateral"),
      0,
      lovelace("10000000"),
      baseAddress(1),
    )
    .changeAddress(baseAddress(0));

/** A Plutus input whose script is read from a reference output, declared as given */
const scriptByReference = (size?: string, hash?: string) =>
  new MeshTxBuilder()
    .spendingPlutusScriptV3()
    .txIn(txHash("script"), 0, lovelace("20000000"), scriptAddress, 0)
    .txInInlineDatumPresent()
    .txInRedeemerValue(mConStr0([]))
    .spendingTxInReference(txHash("ref"), 0, size, hash)
    .txInCollateral(
      txHash("collateral"),
      0,
      lovelace("10000000"),
      baseAddress(1),
    )
    .changeAddress(baseAddress(0));

/** A key input paying for a Plutus mint whose script is read from a reference output */
const plutusMintByReference = (size?: string, hash?: string) =>
  new MeshTxBuilder()
    .txIn(txHash("key"), 0, lovelace("20000000"), baseAddress(0), 0)
    .mintPlutusScriptV3()
    .mint("1", alwaysSucceedHash, "")
    .mintRedeemerValue(mConStr0([]))
    .mintTxInReference(txHash("ref"), 0, size, hash)
    .txInCollateral(
      txHash("collateral"),
      0,
      lovelace("10000000"),
      baseAddress(1),
    )
    .changeAddress(baseAddress(0));

/** A native mint whose script is read from a reference output, as a body can state it */
const nativeMintByReference = (simpleScriptHash?: string, size?: string) => {
  const builder = new MeshTxBuilder()
    .txIn(txHash("key"), 0, lovelace("20000000"), baseAddress(0), 0)
    .changeAddress(baseAddress(0));
  const mint: MintParam = {
    type: "Native",
    policyId: resolveNativeScriptHash(native),
    mintValue: [{ assetName: "", amount: "1" }],
    scriptSource: {
      type: "Inline",
      txHash: txHash("ref"),
      txIndex: 0,
      ...(simpleScriptHash && { simpleScriptHash }),
      ...(size && { scriptSize: size }),
    },
  };
  return { builder, body: { mints: [mint] } };
};

const builds = expect.stringMatching(/^[0-9a-f]+$/);
const missingFetcher = expect.objectContaining({ code: "MISSING_FETCHER" });
const unresolved = expect.objectContaining({ code: "UNRESOLVED" });

describe("MeshTxBuilder without a fetcher", () => {
  describe("an input", () => {
    it.each([
      ["neither amount nor address", {}],
      ["an address only", { address: baseAddress(0), scriptSize: 0 }],
      ["an amount only", { amount: lovelace("20000000"), scriptSize: 0 }],
    ])(
      "with %s cannot be built: MISSING_FETCHER, and UNRESOLVED from completeSync()",
      async (_, declared) => {
        await expect(keyInput(declared).complete()).rejects.toEqual(
          missingFetcher,
        );
        expect(() => keyInput(declared).completeSync()).toThrow(unresolved);
      },
    );

    it("with amount and address but no scriptSize: MISSING_FETCHER, while completeSync() builds", async () => {
      const declared = {
        amount: lovelace("20000000"),
        address: baseAddress(0),
      };
      await expect(keyInput(declared).complete()).rejects.toEqual(
        missingFetcher,
      );
      expect(keyInput(declared).completeSync()).toEqual(builds);
    });

    it("with amount, address and scriptSize builds", async () => {
      const declared = {
        amount: lovelace("20000000"),
        address: baseAddress(0),
        scriptSize: 0,
      };
      await expect(keyInput(declared).complete()).resolves.toEqual(builds);
      expect(keyInput(declared).completeSync()).toEqual(builds);
    });
  });

  describe("a Plutus input", () => {
    it.each([
      ["neither amount nor address", {}],
      ["an address only", { address: scriptAddress, scriptSize: 0 }],
      ["an amount only", { amount: lovelace("20000000"), scriptSize: 0 }],
    ])(
      "with %s cannot be built: MISSING_FETCHER, and UNRESOLVED from completeSync()",
      async (_, declared) => {
        await expect(scriptInput(declared).complete()).rejects.toEqual(
          missingFetcher,
        );
        expect(() => scriptInput(declared).completeSync()).toThrow(unresolved);
      },
    );

    it("with amount, address and scriptSize builds", async () => {
      const declared = {
        amount: lovelace("20000000"),
        address: scriptAddress,
        scriptSize: 0,
      };
      await expect(scriptInput(declared).complete()).resolves.toEqual(builds);
      expect(scriptInput(declared).completeSync()).toEqual(builds);
    });
  });

  describe("a reference script", () => {
    it("with hash and size builds, for a spend and for a mint", async () => {
      for (const make of [scriptByReference, plutusMintByReference]) {
        await expect(
          make(scriptSize, alwaysSucceedHash).complete(),
        ).resolves.toEqual(builds);
        expect(make(scriptSize, alwaysSucceedHash).completeSync()).toEqual(
          builds,
        );
      }
    });

    it("with no size cannot be built: MISSING_FETCHER, and UNRESOLVED from completeSync()", async () => {
      for (const make of [scriptByReference, plutusMintByReference]) {
        await expect(
          make(undefined, alwaysSucceedHash).complete(),
        ).rejects.toEqual(missingFetcher);
        expect(() => make(undefined, alwaysSucceedHash).completeSync()).toThrow(
          unresolved,
        );
      }
    });

    it("with no hash builds: the hash is the input address's or the policy id", async () => {
      for (const make of [scriptByReference, plutusMintByReference]) {
        await expect(make(scriptSize).complete()).resolves.toEqual(builds);
        expect(make(scriptSize).completeSync()).toEqual(builds);
      }
    });

    it("of a native mint needs its size, and takes its hash from the policy id", async () => {
      // The size prices the reference script
      const hashOnly = nativeMintByReference(resolveNativeScriptHash(native));
      await expect(hashOnly.builder.complete(hashOnly.body)).rejects.toEqual(
        missingFetcher,
      );
      for (const hash of [undefined, resolveNativeScriptHash(native)]) {
        const declared = nativeMintByReference(hash, "10");
        await expect(declared.builder.complete(declared.body)).resolves.toEqual(
          builds,
        );
      }
    });
  });
});
