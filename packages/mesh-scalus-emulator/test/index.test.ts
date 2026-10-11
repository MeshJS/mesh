import { CardanoInfo, ProtocolParams, Utxo, Value } from "scalus";

import {
  applyCborEncoding,
  MeshTxBuilder,
  NativeScript,
  resolveDataHash,
  resolveNativeScriptHash,
  resolveNativeScriptHex,
  resolvePaymentKeyHash,
  resolvePlutusScriptAddress,
  resolveScriptHash,
  SLOT_CONFIG_NETWORK,
  unixTimeToEnclosingSlot,
  UTxO,
} from "@meshsdk/core";
import { getTransactionOutputs } from "@meshsdk/core-cst";
import { MeshWallet } from "@meshsdk/wallet";

import { ScalusEmulator } from "../src";

const TEST_MNEMONIC = [
  "solution",
  "solution",
  "solution",
  "solution",
  "solution",
  "solution",
  "solution",
  "solution",
  "solution",
  "solution",
  "solution",
  "solution",
  "solution",
  "solution",
  "solution",
  "solution",
  "solution",
  "solution",
  "solution",
  "solution",
  "solution",
  "solution",
  "solution",
  "solution",
];

// Context-reading Plutus V3 validator from Scalus provider conformance fixtures.
const contextSensitiveScriptHex =
  "58710101002323233001001337006eb4d5d09aba200233700646660020026eb0d5d0" +
  "9aab9e37546ae8400d2000222533357346ae8c00840044ccc00c00cd5d100119b800" +
  "0148008d55ce9baa357426ae88d5d1001112999ab9a3371200290000a4c266004004" +
  "66e04005200235573c6ea80041";

const alwaysSucceedCbor = applyCborEncoding(
  "58340101002332259800a518a4d153300249011856616c696461746f722072657475726e65642066616c736500136564004ae715cd01",
);

async function createTestSetup(lovelacePerAddress = 10_000_000_000n) {
  const wallet = new MeshWallet({
    networkId: 0,
    key: { type: "mnemonic", words: TEST_MNEMONIC },
  });
  await wallet.init();
  const address = (await wallet.getChangeAddress())!;

  const provider = await ScalusEmulator.create(
    [
      {
        input: {
          txHash:
            "0000000000000000000000000000000000000000000000000000000000000000",
          outputIndex: 0,
        },
        output: {
          address,
          amount: [
            { unit: "lovelace", quantity: lovelacePerAddress.toString() },
          ],
        },
      },
    ],
    CardanoInfo.preview(),
  );
  await provider.setSlot(
    unixTimeToEnclosingSlot(Date.now(), SLOT_CONFIG_NETWORK["preview"]),
  );
  const params = await provider.fetchProtocolParameters();

  const newTxBuilder = () =>
    new MeshTxBuilder({
      fetcher: provider,
      submitter: provider,
      evaluator: provider,
      params,
    });

  return {
    wallet,
    address,
    provider,
    emulator: provider.emulator,
    slotConfig: SLOT_CONFIG_NETWORK["preview"],
    newTxBuilder,
  };
}

describe("ScalusEmulator", () => {
  describe("Basic payment lifecycle", () => {
    it("should build, sign, submit and confirm a simple payment", async () => {
      const { wallet, address, provider, newTxBuilder } =
        await createTestSetup();

      const utxos = await provider.fetchAddressUTxOs(address);
      expect(utxos.length).toBeGreaterThan(0);

      const txHex = await newTxBuilder()
        .txOut(address, [{ unit: "lovelace", quantity: "5000000" }])
        .changeAddress(address)
        .selectUtxosFrom(utxos)
        .complete();

      const signedTx = await wallet.signTx(txHex);
      const txHash = await provider.submitTx(signedTx);
      expect(txHash).toBeDefined();
      expect(txHash.length).toBe(64);
    });

    it("should reflect UTxO changes after submission", async () => {
      const { wallet, address, provider, newTxBuilder } =
        await createTestSetup();

      const utxosBefore = await provider.fetchAddressUTxOs(address);
      const totalBefore = utxosBefore.reduce(
        (sum, u) =>
          sum +
          BigInt(u.output.amount.find((a) => a.unit === "lovelace")!.quantity),
        0n,
      );

      const txHex = await newTxBuilder()
        .txOut(address, [{ unit: "lovelace", quantity: "3000000" }])
        .changeAddress(address)
        .selectUtxosFrom(utxosBefore)
        .complete();

      const signedTx = await wallet.signTx(txHex);
      await provider.submitTx(signedTx);

      const utxosAfter = await provider.fetchAddressUTxOs(address);
      const totalAfter = utxosAfter.reduce(
        (sum, u) =>
          sum +
          BigInt(u.output.amount.find((a) => a.unit === "lovelace")!.quantity),
        0n,
      );

      expect(utxosAfter.length).toBeGreaterThan(0);
      // Total should decrease by fees
      expect(totalAfter).toBeLessThan(totalBefore);
      expect(totalAfter).toBeGreaterThan(totalBefore - 1_000_000n);
    });

    it("should chain multiple transactions", async () => {
      const { wallet, address, provider, newTxBuilder } =
        await createTestSetup();

      const utxos1 = await provider.fetchAddressUTxOs(address);
      const txHex1 = await newTxBuilder()
        .txOut(address, [{ unit: "lovelace", quantity: "2000000" }])
        .changeAddress(address)
        .selectUtxosFrom(utxos1)
        .complete();
      const signed1 = await wallet.signTx(txHex1);
      const hash1 = await provider.submitTx(signed1);

      const utxos2 = await provider.fetchAddressUTxOs(address);
      const txHex2 = await newTxBuilder()
        .txOut(address, [{ unit: "lovelace", quantity: "2000000" }])
        .changeAddress(address)
        .selectUtxosFrom(utxos2)
        .complete();
      const signed2 = await wallet.signTx(txHex2);
      const hash2 = await provider.submitTx(signed2);

      expect(hash1).not.toBe(hash2);

      const utxos3 = await provider.fetchAddressUTxOs(address);
      expect(utxos3.length).toBeGreaterThan(0);
      // Original UTxOs should be consumed
      const utxo1Hashes = new Set(utxos1.map((u) => u.input.txHash));
      const utxo3Hashes = new Set(utxos3.map((u) => u.input.txHash));
      for (const h of utxo1Hashes) {
        expect(utxo3Hashes.has(h)).toBe(false);
      }
    });
  });

  describe("Native script minting", () => {
    it("should mint tokens with a native script and verify UTxOs", async () => {
      const { wallet, address, provider, newTxBuilder } =
        await createTestSetup();

      const keyHash = resolvePaymentKeyHash(address);
      const nativeScript: NativeScript = { type: "sig", keyHash };
      const scriptCbor = resolveNativeScriptHex(nativeScript);
      const policyId = resolveNativeScriptHash(nativeScript);
      const tokenNameHex = Buffer.from("TestToken").toString("hex");
      const unit = policyId + tokenNameHex;

      const utxos = await provider.fetchAddressUTxOs(address);

      const txHex = await newTxBuilder()
        .mint("1000", policyId, tokenNameHex)
        .mintingScript(scriptCbor)
        .txOut(address, [
          { unit: "lovelace", quantity: "2000000" },
          { unit, quantity: "1000" },
        ])
        .changeAddress(address)
        .selectUtxosFrom(utxos)
        .complete();

      const signedTx = await wallet.signTx(txHex);
      const txHash = await provider.submitTx(signedTx);
      expect(txHash.length).toBe(64);

      const utxosAfter = await provider.fetchAddressUTxOs(address);
      const tokenUtxo = utxosAfter.find((u) =>
        u.output.amount.some((a) => a.unit === unit),
      );
      expect(tokenUtxo).toBeDefined();
      expect(
        tokenUtxo!.output.amount.find((a) => a.unit === unit)!.quantity,
      ).toBe("1000");
    });

    it("should mint and then burn tokens", async () => {
      const { wallet, address, provider, newTxBuilder } =
        await createTestSetup();

      const keyHash = resolvePaymentKeyHash(address);
      const nativeScript: NativeScript = { type: "sig", keyHash };
      const scriptCbor = resolveNativeScriptHex(nativeScript);
      const policyId = resolveNativeScriptHash(nativeScript);
      const tokenNameHex = Buffer.from("BurnToken").toString("hex");
      const unit = policyId + tokenNameHex;

      // Step 1: Mint
      const utxos = await provider.fetchAddressUTxOs(address);
      const mintTxHex = await newTxBuilder()
        .mint("1000", policyId, tokenNameHex)
        .mintingScript(scriptCbor)
        .txOut(address, [
          { unit: "lovelace", quantity: "2000000" },
          { unit, quantity: "1000" },
        ])
        .changeAddress(address)
        .selectUtxosFrom(utxos)
        .complete();

      const signedMint = await wallet.signTx(mintTxHex);
      await provider.submitTx(signedMint);

      // Step 2: Burn half
      const utxosAfterMint = await provider.fetchAddressUTxOs(address);
      const tokenUtxo = utxosAfterMint.find((u) =>
        u.output.amount.some((a) => a.unit === unit),
      );
      expect(tokenUtxo).toBeDefined();

      const burnTxHex = await newTxBuilder()
        .mint("-500", policyId, tokenNameHex)
        .mintingScript(scriptCbor)
        .txIn(
          tokenUtxo!.input.txHash,
          tokenUtxo!.input.outputIndex,
          tokenUtxo!.output.amount,
          tokenUtxo!.output.address,
        )
        .txOut(address, [
          { unit: "lovelace", quantity: "2000000" },
          { unit, quantity: "500" },
        ])
        .changeAddress(address)
        .selectUtxosFrom(
          utxosAfterMint.filter(
            (u) =>
              u.input.txHash !== tokenUtxo!.input.txHash ||
              u.input.outputIndex !== tokenUtxo!.input.outputIndex,
          ),
        )
        .complete();

      const signedBurn = await wallet.signTx(burnTxHex);
      await provider.submitTx(signedBurn);

      // Step 3: Verify remaining
      const utxosFinal = await provider.fetchAddressUTxOs(address);
      let totalTokens = 0n;
      for (const u of utxosFinal) {
        const tokenAsset = u.output.amount.find((a) => a.unit === unit);
        if (tokenAsset) totalTokens += BigInt(tokenAsset.quantity);
      }
      expect(totalTokens).toBe(500n);
    });
  });

  describe("Plutus script evaluation", () => {
    it("should evaluate and submit a plutus minting transaction", async () => {
      const { wallet, address, provider, newTxBuilder } =
        await createTestSetup();

      const policyId = resolveScriptHash(alwaysSucceedCbor, "V3");
      const tokenNameHex = Buffer.from("PlutusToken").toString("hex");
      const unit = policyId + tokenNameHex;

      const utxos = await provider.fetchAddressUTxOs(address);

      const txHex = await newTxBuilder()
        .mintPlutusScriptV3()
        .mint("100", policyId, tokenNameHex)
        .mintRedeemerValue("")
        .mintingScript(alwaysSucceedCbor)
        .txInCollateral(
          utxos[0]!.input.txHash,
          utxos[0]!.input.outputIndex,
          utxos[0]!.output.amount,
          utxos[0]!.output.address,
        )
        .txOut(address, [
          { unit: "lovelace", quantity: "2000000" },
          { unit, quantity: "100" },
        ])
        .changeAddress(address)
        .selectUtxosFrom(utxos)
        .complete();

      const signedTx = await wallet.signTx(txHex);
      const txHash = await provider.submitTx(signedTx);
      expect(txHash.length).toBe(64);

      const utxosAfter = await provider.fetchAddressUTxOs(address);
      const tokenUtxo = utxosAfter.find((u) =>
        u.output.amount.some((a) => a.unit === unit),
      );
      expect(tokenUtxo).toBeDefined();
      expect(
        tokenUtxo!.output.amount.find((a) => a.unit === unit)!.quantity,
      ).toBe("100");
    });

    it("should query outputs after a plutus minting transaction", async () => {
      const { wallet, address, provider, newTxBuilder, emulator } =
        await createTestSetup();

      const policyId = resolveScriptHash(alwaysSucceedCbor, "V3");
      const tokenNameHex = Buffer.from("SpendTest").toString("hex");
      const unit = policyId + tokenNameHex;

      const utxos = await provider.fetchAddressUTxOs(address);

      // Step 1: Mint tokens using plutus script
      const mintTxHex = await newTxBuilder()
        .mintPlutusScriptV3()
        .mint("50", policyId, tokenNameHex)
        .mintRedeemerValue("")
        .mintingScript(alwaysSucceedCbor)
        .txInCollateral(
          utxos[0]!.input.txHash,
          utxos[0]!.input.outputIndex,
          utxos[0]!.output.amount,
          utxos[0]!.output.address,
        )
        .txOut(address, [
          { unit: "lovelace", quantity: "2000000" },
          { unit, quantity: "50" },
        ])
        .changeAddress(address)
        .selectUtxosFrom(utxos)
        .complete();
      const signedMint = await wallet.signTx(mintTxHex);
      const mintHash = await provider.submitTx(signedMint);
      expect(mintHash.length).toBe(64);

      // Step 2: Verify the minted tokens via fetchUTxOs
      const mintedUtxos = await provider.fetchUTxOs(mintHash);
      expect(mintedUtxos.length).toBeGreaterThan(0);
      const tokenOutput = mintedUtxos.find((u) =>
        u.output.amount.some((a) => a.unit === unit),
      );
      expect(tokenOutput).toBeDefined();
    });
  });

  it("builds, evaluates, signs and submits a context-reading Plutus V3 spend", async () => {
    const { wallet, address, provider, newTxBuilder, emulator } =
      await createTestSetup();
    const scriptAddress = resolvePlutusScriptAddress(
      { code: applyCborEncoding(contextSensitiveScriptHex), version: "V3" },
      0,
    );
    emulator.addUtxo(
      new Utxo(
        "11".repeat(32),
        0,
        scriptAddress,
        Value.ada(50n),
      ).withInlineDatum(Uint8Array.of(0x18, 0x2a)),
    );
    emulator.addUtxo(new Utxo("22".repeat(32), 0, address, Value.ada(10n)));
    const [scriptUtxo] = await provider.fetchAddressUTxOs(scriptAddress);
    expect(scriptUtxo!.output.plutusData).toBe("182a");
    const walletUtxos = await provider.fetchAddressUTxOs(address);
    const collateral = walletUtxos.find(
      (u) => u.input.txHash === "22".repeat(32),
    )!;
    const tx = await newTxBuilder()
      .spendingPlutusScriptV3()
      .txIn(
        scriptUtxo!.input.txHash,
        scriptUtxo!.input.outputIndex,
        scriptUtxo!.output.amount,
        scriptAddress,
      )
      .txInInlineDatumPresent()
      .txInRedeemerValue("05", "CBOR")
      .txInScript(applyCborEncoding(contextSensitiveScriptHex))
      .txInCollateral(
        collateral.input.txHash,
        collateral.input.outputIndex,
        collateral.output.amount,
        address,
      )
      .changeAddress(address)
      .selectUtxosFrom(walletUtxos.filter((u) => u !== collateral))
      .complete();
    const budgets = await provider.evaluateTx(tx);
    expect(budgets).toHaveLength(1);
    expect(budgets[0]!.tag).toBe("SPEND");
    expect(budgets[0]!.budget.steps).toBeGreaterThan(0);
    const signed = await wallet.signTx(tx);
    const hash = await provider.submitTx(signed);
    expect(emulator.hasTx(hash)).toBe(true);
    expect(await provider.fetchAddressUTxOs(scriptAddress)).toEqual([]);
  });

  it("uses the emulator's custom parameters and keeps cost models in V1/V2/V3 order", async () => {
    const info = CardanoInfo.preview();
    const json = JSON.parse(info.protocolParams.toBlockfrostJson());
    json.min_fee_a = 2000;
    const custom = info.withProtocolParams(
      ProtocolParams.fromBlockfrostJson(JSON.stringify(json)),
    );
    const provider = await ScalusEmulator.create([], custom);
    const params = await provider.fetchProtocolParameters();
    expect(params.minFeeA).toBe(2000);
    const models = custom.protocolParams.costModels;
    expect(await provider.fetchCostModels()).toEqual([
      models.PlutusV1,
      models.PlutusV2,
      models.PlutusV3,
    ]);

    const { wallet, address } = await createTestSetup();
    provider.emulator.addUtxo(
      new Utxo("44".repeat(32), 0, address, Value.ada(20n)),
    );
    const inputs = await provider.fetchAddressUTxOs(address);
    const underpriced = await new MeshTxBuilder({
      fetcher: provider,
      submitter: provider,
      evaluator: provider,
    })
      .txOut(address, [{ unit: "lovelace", quantity: "5000000" }])
      .changeAddress(address)
      .selectUtxosFrom(inputs)
      .complete();
    await expect(
      provider.submitTx(await wallet.signTx(underpriced)),
    ).rejects.toThrow("less than minimum required");
    const tx = await new MeshTxBuilder({
      fetcher: provider,
      submitter: provider,
      evaluator: provider,
      params,
    })
      .txOut(address, [{ unit: "lovelace", quantity: "5000000" }])
      .changeAddress(address)
      .selectUtxosFrom(inputs)
      .complete();
    const hash = await provider.submitTx(await wallet.signTx(tx));
    expect(provider.emulator.hasTx(hash)).toBe(true);
  });

  it("evaluates a script spend from a pending parent transaction", async () => {
    const { address, provider, emulator, newTxBuilder } =
      await createTestSetup();
    const scriptAddress = resolvePlutusScriptAddress(
      { code: applyCborEncoding(contextSensitiveScriptHex), version: "V3" },
      0,
    );
    const parent = await newTxBuilder()
      .txOut(scriptAddress, [{ unit: "lovelace", quantity: "50000000" }])
      .txOutInlineDatumValue("182a", "CBOR")
      .changeAddress(address)
      .selectUtxosFrom(await provider.fetchAddressUTxOs(address))
      .complete();
    const scriptUtxo = getTransactionOutputs(parent).find(
      (u) => u.output.address === scriptAddress,
    )!;
    const chainedFetcher = Object.create(provider) as ScalusEmulator;
    chainedFetcher.fetchUTxOs = async (hash, index) =>
      hash === scriptUtxo.input.txHash &&
      (index === undefined || index === scriptUtxo.input.outputIndex)
        ? [scriptUtxo]
        : provider.fetchUTxOs(hash, index);
    const child = await new MeshTxBuilder({
      fetcher: chainedFetcher,
      submitter: provider,
      evaluator: provider,
      params: await provider.fetchProtocolParameters(),
    })
      .spendingPlutusScriptV3()
      .txIn(
        scriptUtxo.input.txHash,
        scriptUtxo.input.outputIndex,
        scriptUtxo.output.amount,
        scriptAddress,
      )
      .txInInlineDatumPresent()
      .txInRedeemerValue("05", "CBOR")
      .txInScript(applyCborEncoding(contextSensitiveScriptHex))
      .inputForEvaluation(scriptUtxo)
      .txOut(address, [{ unit: "lovelace", quantity: "40000000" }])
      .changeAddress(address)
      .chainTx(parent)
      .complete();

    expect(emulator.hasTx(scriptUtxo.input.txHash)).toBe(false);
    await expect(provider.evaluateTx(child)).rejects.toThrow();
    const budgets = await provider.evaluateTx(child, [], [parent]);
    expect(budgets).toHaveLength(1);
    expect(budgets[0]!.tag).toBe("SPEND");
  });

  it("preserves datum hashes, inline datums and reference scripts in initial UTxOs", async () => {
    const { address } = await createTestSetup();
    const base = {
      input: { txHash: "33".repeat(32), outputIndex: 0 },
      output: { address, amount: [{ unit: "lovelace", quantity: "5000000" }] },
    };
    const inputs = [
      {
        ...base,
        output: {
          ...base.output,
          plutusData: "182a",
          scriptRef: "82034100",
        },
      },
      {
        ...base,
        input: { ...base.input, outputIndex: 1 },
        output: { ...base.output, dataHash: "ab".repeat(32) },
      },
    ];
    const provider = await ScalusEmulator.create(inputs);
    for (const input of inputs)
      expect(
        (
          await provider.fetchUTxOs(input.input.txHash, input.input.outputIndex)
        )[0],
      ).toMatchObject(input);
    const inlineDatum = "182a";
    await expect(
      ScalusEmulator.create([
        {
          ...base,
          output: {
            ...base.output,
            plutusData: inlineDatum,
            dataHash: resolveDataHash(inlineDatum, "CBOR"),
          },
        },
      ]),
    ).resolves.toBeInstanceOf(ScalusEmulator);
    await expect(
      ScalusEmulator.create([
        {
          ...base,
          output: {
            ...base.output,
            plutusData: inlineDatum,
            dataHash: "ab".repeat(32),
          },
        },
      ]),
    ).rejects.toThrow("does not match");
    await expect(provider.evaluateTx("zz")).rejects.toThrow(
      "Invalid hexadecimal CBOR",
    );
  });

  describe("Validity intervals", () => {
    it("should build and submit a transaction with TTL", async () => {
      const { wallet, address, provider, newTxBuilder, slotConfig } =
        await createTestSetup();

      const currentSlot = unixTimeToEnclosingSlot(Date.now(), slotConfig);
      const ttlSlot = currentSlot + 300;

      const utxos = await provider.fetchAddressUTxOs(address);

      const txHex = await newTxBuilder()
        .txOut(address, [{ unit: "lovelace", quantity: "2000000" }])
        .invalidHereafter(ttlSlot)
        .changeAddress(address)
        .selectUtxosFrom(utxos)
        .complete();

      const signedTx = await wallet.signTx(txHex);
      const txHash = await provider.submitTx(signedTx);
      expect(txHash.length).toBe(64);
    });

    it("should build and submit with both validity bounds", async () => {
      const { wallet, address, provider, newTxBuilder, slotConfig } =
        await createTestSetup();

      const currentSlot = unixTimeToEnclosingSlot(Date.now(), slotConfig);
      const validFrom = currentSlot - 10;
      const validTo = currentSlot + 300;

      const utxos = await provider.fetchAddressUTxOs(address);

      const txHex = await newTxBuilder()
        .txOut(address, [{ unit: "lovelace", quantity: "2000000" }])
        .invalidBefore(validFrom)
        .invalidHereafter(validTo)
        .changeAddress(address)
        .selectUtxosFrom(utxos)
        .complete();

      const signedTx = await wallet.signTx(txHex);
      const txHash = await provider.submitTx(signedTx);
      expect(txHash.length).toBe(64);
    });

    it("should reject an expired transaction", async () => {
      const { wallet, address, provider, newTxBuilder, slotConfig } =
        await createTestSetup();

      const currentSlot = unixTimeToEnclosingSlot(Date.now(), slotConfig);
      const expiredSlot = currentSlot - 100;

      const utxos = await provider.fetchAddressUTxOs(address);

      const txHex = await newTxBuilder()
        .txOut(address, [{ unit: "lovelace", quantity: "2000000" }])
        .invalidHereafter(expiredSlot)
        .changeAddress(address)
        .selectUtxosFrom(utxos)
        .complete();

      const signedTx = await wallet.signTx(txHex);
      await expect(provider.submitTx(signedTx)).rejects.toThrow();
    });

    it("should reject a transaction before validity start", async () => {
      const { wallet, address, provider, newTxBuilder, slotConfig } =
        await createTestSetup();

      const currentSlot = unixTimeToEnclosingSlot(Date.now(), slotConfig);
      const futureStart = currentSlot + 300;
      const futureTtl = currentSlot + 600;

      const utxos = await provider.fetchAddressUTxOs(address);

      const txHex = await newTxBuilder()
        .txOut(address, [{ unit: "lovelace", quantity: "2000000" }])
        .invalidBefore(futureStart)
        .invalidHereafter(futureTtl)
        .changeAddress(address)
        .selectUtxosFrom(utxos)
        .complete();

      const signedTx = await wallet.signTx(txHex);
      await expect(provider.submitTx(signedTx)).rejects.toThrow();
    });
  });

  describe("Transaction composition", () => {
    it("should build a transaction with multiple outputs", async () => {
      const { wallet, address, provider, newTxBuilder } =
        await createTestSetup();

      const utxos = await provider.fetchAddressUTxOs(address);

      const txHex = await newTxBuilder()
        .txOut(address, [{ unit: "lovelace", quantity: "2000000" }])
        .txOut(address, [{ unit: "lovelace", quantity: "3000000" }])
        .txOut(address, [{ unit: "lovelace", quantity: "4000000" }])
        .changeAddress(address)
        .selectUtxosFrom(utxos)
        .complete();

      const signedTx = await wallet.signTx(txHex);
      const txHash = await provider.submitTx(signedTx);
      expect(txHash.length).toBe(64);

      const utxosAfter = await provider.fetchAddressUTxOs(address);
      const amounts = utxosAfter.map((u) =>
        BigInt(u.output.amount.find((a) => a.unit === "lovelace")!.quantity),
      );
      expect(amounts.filter((a) => a === 2_000_000n).length).toBeGreaterThan(0);
      expect(amounts.filter((a) => a === 3_000_000n).length).toBeGreaterThan(0);
      expect(amounts.filter((a) => a === 4_000_000n).length).toBeGreaterThan(0);
    });

    it("should combine minting and payment in a single transaction", async () => {
      const { wallet, address, provider, newTxBuilder } =
        await createTestSetup();

      const keyHash = resolvePaymentKeyHash(address);
      const nativeScript: NativeScript = { type: "sig", keyHash };
      const scriptCbor = resolveNativeScriptHex(nativeScript);
      const policyId = resolveNativeScriptHash(nativeScript);
      const tokenNameHex = Buffer.from("ComboToken").toString("hex");
      const unit = policyId + tokenNameHex;

      const utxos = await provider.fetchAddressUTxOs(address);

      const txHex = await newTxBuilder()
        .mint("777", policyId, tokenNameHex)
        .mintingScript(scriptCbor)
        .txOut(address, [
          { unit: "lovelace", quantity: "5000000" },
          { unit, quantity: "777" },
        ])
        .txOut(address, [{ unit: "lovelace", quantity: "3000000" }])
        .changeAddress(address)
        .selectUtxosFrom(utxos)
        .complete();

      const signedTx = await wallet.signTx(txHex);
      const txHash = await provider.submitTx(signedTx);
      expect(txHash.length).toBe(64);

      const utxosAfter = await provider.fetchAddressUTxOs(address);
      const tokenUtxo = utxosAfter.find((u) =>
        u.output.amount.some((a) => a.unit === unit),
      );
      expect(tokenUtxo).toBeDefined();
      expect(
        tokenUtxo!.output.amount.find((a) => a.unit === unit)!.quantity,
      ).toBe("777");
    });

    it("should build a transaction with metadata", async () => {
      const { wallet, address, provider, newTxBuilder } =
        await createTestSetup();

      const utxos = await provider.fetchAddressUTxOs(address);

      const txHex = await newTxBuilder()
        .txOut(address, [{ unit: "lovelace", quantity: "2000000" }])
        .metadataValue(674, "Hello from ScalusEmulator test")
        .changeAddress(address)
        .selectUtxosFrom(utxos)
        .complete();

      const signedTx = await wallet.signTx(txHex);
      const txHash = await provider.submitTx(signedTx);
      expect(txHash.length).toBe(64);
    });
  });

  describe("Error handling", () => {
    it("should reject a transaction with insufficient funds", async () => {
      const { wallet, address, provider, newTxBuilder } =
        await createTestSetup(5_000_000n);

      const utxos = await provider.fetchAddressUTxOs(address);

      await expect(
        newTxBuilder()
          .txOut(address, [{ unit: "lovelace", quantity: "100000000000" }])
          .changeAddress(address)
          .selectUtxosFrom(utxos)
          .complete(),
      ).rejects.toThrow();
    });

    it("should reject submitting an unsigned transaction", async () => {
      const { address, provider, newTxBuilder } = await createTestSetup();

      const utxos = await provider.fetchAddressUTxOs(address);

      const txHex = await newTxBuilder()
        .txOut(address, [{ unit: "lovelace", quantity: "2000000" }])
        .changeAddress(address)
        .selectUtxosFrom(utxos)
        .complete();

      await expect(provider.submitTx(txHex)).rejects.toThrow();
    });

    it("should throw on unsupported fetcher methods", async () => {
      const { provider } = await createTestSetup();

      await expect(provider.fetchAccountInfo("addr_test1...")).rejects.toThrow(
        "not supported",
      );
      await expect(provider.fetchBlockInfo("abc")).rejects.toThrow(
        "not supported",
      );
      await expect(provider.fetchTxInfo("abc")).rejects.toThrow(
        "not supported",
      );
    });
  });

  describe("UTxO querying", () => {
    it("should fetch UTxOs by transaction hash after submission", async () => {
      const { wallet, address, provider, newTxBuilder } =
        await createTestSetup();

      const utxos = await provider.fetchAddressUTxOs(address);

      const txHex = await newTxBuilder()
        .txOut(address, [{ unit: "lovelace", quantity: "7000000" }])
        .changeAddress(address)
        .selectUtxosFrom(utxos)
        .complete();

      const signedTx = await wallet.signTx(txHex);
      const txHash = await provider.submitTx(signedTx);

      const txUtxos = await provider.fetchUTxOs(txHash);
      expect(txUtxos.length).toBeGreaterThan(0);
      expect(txUtxos.every((u) => u.input.txHash === txHash)).toBe(true);

      const has7Ada = txUtxos.some((u) =>
        u.output.amount.some(
          (a) => a.unit === "lovelace" && a.quantity === "7000000",
        ),
      );
      expect(has7Ada).toBe(true);
    });

    it("should filter UTxOs by asset unit", async () => {
      const { wallet, address, provider, newTxBuilder } =
        await createTestSetup();

      const keyHash = resolvePaymentKeyHash(address);
      const nativeScript: NativeScript = { type: "sig", keyHash };
      const scriptCbor = resolveNativeScriptHex(nativeScript);
      const policyId = resolveNativeScriptHash(nativeScript);
      const tokenNameHex = Buffer.from("FilterToken").toString("hex");
      const unit = policyId + tokenNameHex;

      const utxos = await provider.fetchAddressUTxOs(address);

      const txHex = await newTxBuilder()
        .mint("200", policyId, tokenNameHex)
        .mintingScript(scriptCbor)
        .txOut(address, [
          { unit: "lovelace", quantity: "2000000" },
          { unit, quantity: "200" },
        ])
        .changeAddress(address)
        .selectUtxosFrom(utxos)
        .complete();

      const signedTx = await wallet.signTx(txHex);
      await provider.submitTx(signedTx);

      const allUtxos = await provider.fetchAddressUTxOs(address);
      const filteredUtxos = await provider.fetchAddressUTxOs(address, unit);

      expect(filteredUtxos.length).toBeLessThan(allUtxos.length);
      expect(filteredUtxos.length).toBe(1);
      expect(
        filteredUtxos[0]!.output.amount.find((a) => a.unit === unit)!.quantity,
      ).toBe("200");
    });

    it("should allow inputting additional UTxOs for script evaluation", async () => {
      const { address, provider, emulator } = await createTestSetup();

      const policyId = resolveScriptHash(alwaysSucceedCbor, "V3");
      const tokenNameHex = Buffer.from("SpendTest").toString("hex");
      const unit = policyId + tokenNameHex;

      const utxos = await provider.fetchAddressUTxOs(address);
      const testUtxo: UTxO = {
        input: {
          txHash:
            "ffe00432c78714fbd9c1784a6b574b0b11bd7c9dedb305aa7f55593505607539",
          outputIndex: 0,
        },
        output: {
          address,
          amount: [{ unit: "lovelace", quantity: "2000000" }],
        },
      };
      // Step 1: Mint tokens using plutus script
      const mintTxHex = await new MeshTxBuilder({
        fetcher: provider,
      })
        .txIn(
          testUtxo.input.txHash,
          testUtxo.input.outputIndex,
          testUtxo.output.amount,
          testUtxo.output.address,
          0,
        )
        .mintPlutusScriptV3()
        .mint("50", policyId, tokenNameHex)
        .mintRedeemerValue("")
        .mintingScript(alwaysSucceedCbor)
        .txInCollateral(
          utxos[0]!.input.txHash,
          utxos[0]!.input.outputIndex,
          utxos[0]!.output.amount,
          utxos[0]!.output.address,
        )
        .setFee("2000000")
        .txOut(address, [
          { unit: "lovelace", quantity: "2000000" },
          { unit, quantity: "50" },
        ])
        .changeAddress(address)
        .selectUtxosFrom(utxos)
        .complete();
      const evaluateResult = await provider.evaluateTx(mintTxHex, [testUtxo]);
      expect(evaluateResult).toEqual([
        {
          tag: "MINT",
          index: 0,
          budget: { mem: 2001, steps: 380149 },
        },
      ]);
    });
  });
});
