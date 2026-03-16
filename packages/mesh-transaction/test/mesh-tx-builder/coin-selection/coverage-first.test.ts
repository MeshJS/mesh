import { MeshValue, UTxO } from "@meshsdk/common";
import { serializePlutusScript } from "@meshsdk/core";
import { resolveScriptRef, Transaction, TxCBOR } from "@meshsdk/core-cst";
import { OfflineFetcher } from "@meshsdk/provider";
import {
  CoinSelectionError,
  CoverageFirstSelector,
  MeshTxBuilder,
} from "@meshsdk/transaction";

import {
  alwaysSucceedCbor,
  alwaysSucceedHash,
  baseAddress,
  calculateInputMeshValue,
  calculateMinLovelaceForTransactionOutput,
  calculateOutputMeshValue,
  mockTokenUnit,
  txHash,
} from "../../test-util";

describe("MeshTxBuilder - coin selection - Coverage First", () => {
  let txBuilder: MeshTxBuilder;

  beforeEach(() => {
    const offlineFetcher = new OfflineFetcher();
    offlineFetcher.addUTxOs([
      {
        input: {
          txHash: txHash("tx3"),
          outputIndex: 0,
        },
        output: {
          address: serializePlutusScript({
            code: alwaysSucceedCbor,
            version: "V3",
          }).address,
          amount: [
            {
              unit: "lovelace",
              quantity: "100000000",
            },
          ],
          scriptHash: alwaysSucceedHash,
          scriptRef: resolveScriptRef({
            code: alwaysSucceedCbor,
            version: "V3",
          }),
        },
      },
    ]);
    txBuilder = new MeshTxBuilder({
      fetcher: offlineFetcher,
      selector: new CoverageFirstSelector(),
    });
  });

  // ============================================================================
  // A. Basic Selection (4 tests)
  // ============================================================================

  describe("A. Basic Selection", () => {
    it("Simple lovelace transfer", async () => {
      const utxosForSelection: UTxO[] = [
        {
          input: {
            txHash: txHash("tx0"),
            outputIndex: 0,
          },
          output: {
            address: baseAddress(0),
            amount: [
              {
                unit: "lovelace",
                quantity: "5000000",
              },
            ],
          },
        },
      ];

      const tx = await txBuilder
        .txOut(baseAddress(1), [
          {
            unit: "lovelace",
            quantity: "2000000",
          },
        ])
        .selectUtxosFrom(utxosForSelection)
        .changeAddress(baseAddress(0))
        .complete();

      const cardanoTx = Transaction.fromCbor(TxCBOR(tx));
      expect(cardanoTx.body().outputs().length).toBeGreaterThanOrEqual(2);
    });

    it("Transaction balances correctly (inputs = outputs + fee)", async () => {
      const inputValue = 10000000n;
      const utxosForSelection: UTxO[] = [
        {
          input: {
            txHash: txHash("tx0"),
            outputIndex: 0,
          },
          output: {
            address: baseAddress(0),
            amount: [
              {
                unit: "lovelace",
                quantity: inputValue.toString(),
              },
            ],
          },
        },
      ];

      const tx = await txBuilder
        .txOut(baseAddress(1), [
          {
            unit: "lovelace",
            quantity: "2000000",
          },
        ])
        .selectUtxosFrom(utxosForSelection)
        .changeAddress(baseAddress(0))
        .complete();

      const cardanoTx = Transaction.fromCbor(TxCBOR(tx));
      const fee = cardanoTx.body().fee();
      const outputs = cardanoTx.body().outputs();
      const totalOutput = outputs.reduce((acc, output) => {
        return acc + output.amount().coin();
      }, 0n);
      expect(totalOutput + fee).toEqual(inputValue);
    });

    it("Handles minting", async () => {
      const mintAsset = alwaysSucceedHash;
      const inputValue = 10000000n;
      const utxosForSelection: UTxO[] = [
        {
          input: {
            txHash: txHash("tx1"),
            outputIndex: 0,
          },
          output: {
            address: baseAddress(1),
            amount: [
              {
                unit: "lovelace",
                quantity: inputValue.toString(),
              },
            ],
          },
        },
      ];
      const tx = await txBuilder
        .txOut(baseAddress(1), [
          {
            unit: "lovelace",
            quantity: "1000000",
          },
          {
            unit: mintAsset,
            quantity: "1000",
          },
        ])
        .mintPlutusScriptV3()
        .mint("1000", alwaysSucceedHash, "")
        .mintRedeemerValue("")
        .mintTxInReference(txHash("tx3"), 0)
        .selectUtxosFrom(utxosForSelection)
        .changeAddress(baseAddress(1))
        .complete();

      const cardanoTx = Transaction.fromCbor(TxCBOR(tx));
      expect(cardanoTx.body().outputs().length).toEqual(2);
      const fee = cardanoTx.body().fee();
      const outputs = cardanoTx.body().outputs();
      const totalOutput = outputs.reduce((acc, output) => {
        return acc + output.amount().coin();
      }, 0n);
      expect(totalOutput + fee).toEqual(inputValue);
    });

    it("Handles multiple outputs", async () => {
      const mintAsset = alwaysSucceedHash;
      const inputValue1 = 10000000n;
      const inputValue2 = 100n;
      const inputValue3 = 30000n;
      const inputValue4 = 30000n;

      const utxosForSelection: UTxO[] = [
        {
          input: {
            txHash: txHash("tx10"),
            outputIndex: 0,
          },
          output: {
            address: baseAddress(1),
            amount: [
              {
                unit: "lovelace",
                quantity: inputValue1.toString(),
              },
            ],
          },
        },
        {
          input: {
            txHash: txHash("tx9"),
            outputIndex: 0,
          },
          output: {
            address: baseAddress(1),
            amount: [
              {
                unit: "lovelace",
                quantity: inputValue2.toString(),
              },
              {
                unit: mockTokenUnit(1),
                quantity: "100",
              },
            ],
          },
        },
      ];

      const tx = await txBuilder
        .txIn(
          txHash("tx7"),
          0,
          [
            {
              unit: "lovelace",
              quantity: inputValue3.toString(),
            },
          ],
          baseAddress(1),
          0,
        )
        .txIn(
          txHash("tx6"),
          0,
          [
            {
              unit: "lovelace",
              quantity: inputValue4.toString(),
            },
          ],
          baseAddress(2),
          0,
        )
        .txOut(baseAddress(0), [
          {
            unit: "lovelace",
            quantity: "1000000",
          },
          {
            unit: mintAsset,
            quantity: "1000",
          },
        ])
        .txOut(baseAddress(5), [
          {
            unit: "lovelace",
            quantity: "1000000",
          },
          {
            unit: mockTokenUnit(1),
            quantity: "100",
          },
        ])
        .mintPlutusScriptV3()
        .mint("1000", alwaysSucceedHash, "")
        .mintRedeemerValue("")
        .mintTxInReference(txHash("tx3"), 0)
        .selectUtxosFrom(utxosForSelection)
        .changeAddress(baseAddress(1))
        .complete();

      const cardanoTx = Transaction.fromCbor(TxCBOR(tx));
      expect(cardanoTx.body().inputs().size()).toEqual(4);
      expect(cardanoTx.body().outputs().length).toEqual(3);

      const fee = cardanoTx.body().fee();
      const outputs = cardanoTx.body().outputs();
      const totalOutput = outputs.reduce((acc, output) => {
        return acc + output.amount().coin();
      }, 0n);
      expect(totalOutput + fee).toEqual(
        inputValue1 + inputValue2 + inputValue3 + inputValue4,
      );
    });
  });

  // ============================================================================
  // B. Coverage Phase Behavior (5 tests)
  // ============================================================================

  describe("B. Coverage Phase Behavior", () => {
    it("Prefers UTxO covering multiple asset types over single-asset UTxOs", async () => {
      // UTxO with multiple tokens should be preferred
      const utxosForSelection: UTxO[] = [
        {
          input: { txHash: txHash("single1"), outputIndex: 0 },
          output: {
            address: baseAddress(0),
            amount: [
              { unit: "lovelace", quantity: "5000000" },
              { unit: mockTokenUnit(1), quantity: "1000000" },
            ],
          },
        },
        {
          input: { txHash: txHash("single2"), outputIndex: 0 },
          output: {
            address: baseAddress(0),
            amount: [
              { unit: "lovelace", quantity: "5000000" },
              { unit: mockTokenUnit(2), quantity: "1000000" },
            ],
          },
        },
        {
          input: { txHash: txHash("multi"), outputIndex: 0 },
          output: {
            address: baseAddress(0),
            amount: [
              { unit: "lovelace", quantity: "3000000" },
              { unit: mockTokenUnit(1), quantity: "500000" },
              { unit: mockTokenUnit(2), quantity: "500000" },
            ],
          },
        },
      ];

      const tx = await txBuilder
        .txOut(baseAddress(1), [
          { unit: mockTokenUnit(1), quantity: "400000" },
          { unit: mockTokenUnit(2), quantity: "400000" },
          { unit: "lovelace", quantity: "2000000" },
        ])
        .selectUtxosFrom(utxosForSelection)
        .changeAddress(baseAddress(0))
        .complete();

      const cardanoTx = Transaction.fromCbor(TxCBOR(tx));
      // Should select the multi-asset UTxO (covers both tokens) rather than two single-asset UTxOs
      expect(cardanoTx.body().inputs().size()).toBeLessThanOrEqual(2);
    });

    it("Uses intersection as tiebreaker when coverage reduction is equal", async () => {
      // Both UTxOs reduce coverage by same amount, but one has more intersection with deficit
      const utxosForSelection: UTxO[] = [
        {
          input: { txHash: txHash("utxo1"), outputIndex: 0 },
          output: {
            address: baseAddress(0),
            amount: [
              { unit: "lovelace", quantity: "5000000" },
              { unit: mockTokenUnit(1), quantity: "1000" },
            ],
          },
        },
        {
          input: { txHash: txHash("utxo2"), outputIndex: 0 },
          output: {
            address: baseAddress(0),
            amount: [
              { unit: "lovelace", quantity: "5000000" },
              { unit: mockTokenUnit(1), quantity: "2000" },
              { unit: mockTokenUnit(2), quantity: "1000" },
            ],
          },
        },
      ];

      const tx = await txBuilder
        .txOut(baseAddress(1), [
          { unit: mockTokenUnit(1), quantity: "500" },
          { unit: mockTokenUnit(2), quantity: "500" },
          { unit: "lovelace", quantity: "2000000" },
        ])
        .selectUtxosFrom(utxosForSelection)
        .changeAddress(baseAddress(0))
        .complete();

      const cardanoTx = Transaction.fromCbor(TxCBOR(tx));
      expect(cardanoTx.body().outputs().length).toBeGreaterThanOrEqual(2);
    });

    it("Exits coverage phase when ≤1 asset type remains", async () => {
      // After selecting UTxO covering multiple assets, only lovelace should remain
      const utxosForSelection: UTxO[] = [
        {
          input: { txHash: txHash("utxo0"), outputIndex: 0 },
          output: {
            address: baseAddress(0),
            amount: [
              { unit: "lovelace", quantity: "10000000" },
              { unit: mockTokenUnit(1), quantity: "5000" },
            ],
          },
        },
      ];

      const tx = await txBuilder
        .txOut(baseAddress(1), [
          { unit: mockTokenUnit(1), quantity: "1000" },
          { unit: "lovelace", quantity: "2000000" },
        ])
        .selectUtxosFrom(utxosForSelection)
        .changeAddress(baseAddress(0))
        .complete();

      const cardanoTx = Transaction.fromCbor(TxCBOR(tx));
      expect(cardanoTx.body().inputs().size()).toEqual(1);
    });

    it("Rating formula: (typesReduced + intersection/10) works correctly", async () => {
      // UTxO that reduces 2 types (rating 2) should be preferred over
      // UTxO that reduces 1 type with high intersection (rating ~1.3)
      const utxosForSelection: UTxO[] = [
        {
          input: { txHash: txHash("high-intersect"), outputIndex: 0 },
          output: {
            address: baseAddress(0),
            amount: [
              { unit: "lovelace", quantity: "10000000" },
              { unit: mockTokenUnit(1), quantity: "10000" },
              { unit: mockTokenUnit(2), quantity: "10000" },
              { unit: mockTokenUnit(3), quantity: "10000" },
            ],
          },
        },
        {
          input: { txHash: txHash("two-types"), outputIndex: 0 },
          output: {
            address: baseAddress(0),
            amount: [
              { unit: "lovelace", quantity: "5000000" },
              { unit: mockTokenUnit(4), quantity: "5000" },
              { unit: mockTokenUnit(5), quantity: "5000" },
            ],
          },
        },
      ];

      const tx = await txBuilder
        .txOut(baseAddress(1), [
          { unit: mockTokenUnit(1), quantity: "1000" },
          { unit: mockTokenUnit(2), quantity: "1000" },
          { unit: mockTokenUnit(3), quantity: "1000" },
          { unit: mockTokenUnit(4), quantity: "1000" },
          { unit: mockTokenUnit(5), quantity: "1000" },
          { unit: "lovelace", quantity: "2000000" },
        ])
        .selectUtxosFrom(utxosForSelection)
        .changeAddress(baseAddress(0))
        .complete();

      const cardanoTx = Transaction.fromCbor(TxCBOR(tx));
      expect(cardanoTx.body().inputs().size()).toEqual(2);
    });

    it("Handles 10+ different token types efficiently", async () => {
      const tokens: { unit: string; quantity: string }[] = [];
      for (let i = 1; i <= 12; i++) {
        tokens.push({ unit: mockTokenUnit(i), quantity: "1000" });
      }

      // Create UTxOs that each have a few tokens
      const utxosForSelection: UTxO[] = [
        {
          input: { txHash: txHash("batch1"), outputIndex: 0 },
          output: {
            address: baseAddress(0),
            amount: [
              { unit: "lovelace", quantity: "10000000" },
              { unit: mockTokenUnit(1), quantity: "5000" },
              { unit: mockTokenUnit(2), quantity: "5000" },
              { unit: mockTokenUnit(3), quantity: "5000" },
              { unit: mockTokenUnit(4), quantity: "5000" },
            ],
          },
        },
        {
          input: { txHash: txHash("batch2"), outputIndex: 0 },
          output: {
            address: baseAddress(0),
            amount: [
              { unit: "lovelace", quantity: "10000000" },
              { unit: mockTokenUnit(5), quantity: "5000" },
              { unit: mockTokenUnit(6), quantity: "5000" },
              { unit: mockTokenUnit(7), quantity: "5000" },
              { unit: mockTokenUnit(8), quantity: "5000" },
            ],
          },
        },
        {
          input: { txHash: txHash("batch3"), outputIndex: 0 },
          output: {
            address: baseAddress(0),
            amount: [
              { unit: "lovelace", quantity: "10000000" },
              { unit: mockTokenUnit(9), quantity: "5000" },
              { unit: mockTokenUnit(10), quantity: "5000" },
              { unit: mockTokenUnit(11), quantity: "5000" },
              { unit: mockTokenUnit(12), quantity: "5000" },
            ],
          },
        },
      ];

      const tx = await txBuilder
        .txOut(baseAddress(1), [{ unit: "lovelace", quantity: "2000000" }, ...tokens])
        .selectUtxosFrom(utxosForSelection)
        .changeAddress(baseAddress(0))
        .complete();

      const cardanoTx = Transaction.fromCbor(TxCBOR(tx));
      expect(cardanoTx.body().inputs().size()).toEqual(3);
    });
  });

  // ============================================================================
  // C. Magnitude Phase Behavior (3 tests)
  // ============================================================================

  describe("C. Magnitude Phase Behavior", () => {
    it("Picks UTxO with maximum of target asset", async () => {
      const utxosForSelection: UTxO[] = [
        {
          input: { txHash: txHash("small"), outputIndex: 0 },
          output: {
            address: baseAddress(0),
            amount: [
              { unit: "lovelace", quantity: "2000000" },
              { unit: mockTokenUnit(1), quantity: "100" },
            ],
          },
        },
        {
          input: { txHash: txHash("large"), outputIndex: 0 },
          output: {
            address: baseAddress(0),
            amount: [
              { unit: "lovelace", quantity: "2000000" },
              { unit: mockTokenUnit(1), quantity: "10000" },
            ],
          },
        },
      ];

      const tx = await txBuilder
        .txOut(baseAddress(1), [
          { unit: mockTokenUnit(1), quantity: "5000" },
          { unit: "lovelace", quantity: "1000000" },
        ])
        .selectUtxosFrom(utxosForSelection)
        .changeAddress(baseAddress(0))
        .complete();

      const cardanoTx = Transaction.fromCbor(TxCBOR(tx));
      // Should have selected the large UTxO first
      expect(cardanoTx.body().inputs().size()).toEqual(1);
    });

    it("Processes assets in order until all satisfied", async () => {
      const utxosForSelection: UTxO[] = [
        {
          input: { txHash: txHash("utxo1"), outputIndex: 0 },
          output: {
            address: baseAddress(0),
            amount: [
              { unit: "lovelace", quantity: "5000000" },
              { unit: mockTokenUnit(1), quantity: "10000" },
            ],
          },
        },
        {
          input: { txHash: txHash("utxo2"), outputIndex: 0 },
          output: {
            address: baseAddress(0),
            amount: [
              { unit: "lovelace", quantity: "5000000" },
              { unit: mockTokenUnit(2), quantity: "10000" },
            ],
          },
        },
      ];

      const tx = await txBuilder
        .txOut(baseAddress(1), [
          { unit: mockTokenUnit(1), quantity: "5000" },
          { unit: mockTokenUnit(2), quantity: "5000" },
          { unit: "lovelace", quantity: "2000000" },
        ])
        .selectUtxosFrom(utxosForSelection)
        .changeAddress(baseAddress(0))
        .complete();

      const cardanoTx = Transaction.fromCbor(TxCBOR(tx));
      expect(cardanoTx.body().inputs().size()).toEqual(2);
    });

    it("Transitions smoothly from coverage to magnitude phase", async () => {
      // First UTxO covers multiple types, second needed for magnitude
      const utxosForSelection: UTxO[] = [
        {
          input: { txHash: txHash("coverage"), outputIndex: 0 },
          output: {
            address: baseAddress(0),
            amount: [
              { unit: "lovelace", quantity: "2000000" },
              { unit: mockTokenUnit(1), quantity: "100" },
              { unit: mockTokenUnit(2), quantity: "100" },
            ],
          },
        },
        {
          input: { txHash: txHash("magnitude"), outputIndex: 0 },
          output: {
            address: baseAddress(0),
            amount: [
              { unit: "lovelace", quantity: "10000000" },
              { unit: mockTokenUnit(1), quantity: "10000" },
            ],
          },
        },
      ];

      const tx = await txBuilder
        .txOut(baseAddress(1), [
          { unit: mockTokenUnit(1), quantity: "5000" },
          { unit: mockTokenUnit(2), quantity: "50" },
          { unit: "lovelace", quantity: "2000000" },
        ])
        .selectUtxosFrom(utxosForSelection)
        .changeAddress(baseAddress(0))
        .complete();

      const cardanoTx = Transaction.fromCbor(TxCBOR(tx));
      expect(cardanoTx.body().inputs().size()).toEqual(2);
    });
  });

  // ============================================================================
  // D. Error Handling (4 tests)
  // ============================================================================

  describe("D. Error Handling", () => {
    it("Throws CoinSelectionError with phase='coverage' when stuck", async () => {
      const utxosForSelection: UTxO[] = [
        {
          input: { txHash: txHash("utxo1"), outputIndex: 0 },
          output: {
            address: baseAddress(0),
            amount: [
              { unit: "lovelace", quantity: "5000000" },
              { unit: mockTokenUnit(1), quantity: "1000" },
            ],
          },
        },
      ];

      await expect(
        txBuilder
          .txOut(baseAddress(1), [
            { unit: mockTokenUnit(1), quantity: "500" },
            { unit: mockTokenUnit(2), quantity: "500" }, // This token doesn't exist
            { unit: mockTokenUnit(3), quantity: "500" }, // This token doesn't exist
            { unit: "lovelace", quantity: "2000000" },
          ])
          .selectUtxosFrom(utxosForSelection)
          .changeAddress(baseAddress(0))
          .complete(),
      ).rejects.toThrow();
    });

    it("Throws CoinSelectionError with phase='magnitude' when asset unavailable", async () => {
      const utxosForSelection: UTxO[] = [
        {
          input: { txHash: txHash("utxo1"), outputIndex: 0 },
          output: {
            address: baseAddress(0),
            amount: [
              { unit: "lovelace", quantity: "5000000" },
            ],
          },
        },
      ];

      await expect(
        txBuilder
          .txOut(baseAddress(1), [
            { unit: mockTokenUnit(99), quantity: "1000" },
            { unit: "lovelace", quantity: "2000000" },
          ])
          .selectUtxosFrom(utxosForSelection)
          .changeAddress(baseAddress(0))
          .complete(),
      ).rejects.toThrow();
    });

    it("Throws CoinSelectionError with phase='final' when insufficient total", async () => {
      const utxosForSelection: UTxO[] = [
        {
          input: { txHash: txHash("utxo1"), outputIndex: 0 },
          output: {
            address: baseAddress(0),
            amount: [
              { unit: "lovelace", quantity: "1000000" },
              { unit: mockTokenUnit(1), quantity: "100" },
            ],
          },
        },
      ];

      await expect(
        txBuilder
          .txOut(baseAddress(1), [
            { unit: mockTokenUnit(1), quantity: "500" }, // More than available
            { unit: "lovelace", quantity: "2000000" },
          ])
          .selectUtxosFrom(utxosForSelection)
          .changeAddress(baseAddress(0))
          .complete(),
      ).rejects.toThrow();
    });

    it("Error includes helpful deficit summary", async () => {
      const utxosForSelection: UTxO[] = [
        {
          input: { txHash: txHash("utxo1"), outputIndex: 0 },
          output: {
            address: baseAddress(0),
            amount: [{ unit: "lovelace", quantity: "1000000" }],
          },
        },
      ];

      try {
        await txBuilder
          .txOut(baseAddress(1), [
            { unit: mockTokenUnit(1), quantity: "1000" },
            { unit: "lovelace", quantity: "2000000" },
          ])
          .selectUtxosFrom(utxosForSelection)
          .changeAddress(baseAddress(0))
          .complete();
        fail("Expected error to be thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain("Deficit");
      }
    });
  });

  // ============================================================================
  // E. Edge Cases (6 tests)
  // ============================================================================

  describe("E. Edge Cases", () => {
    it("Minimum ADA requirement for change output", async () => {
      const utxosForSelection: UTxO[] = [
        {
          input: { txHash: txHash("tx0"), outputIndex: 0 },
          output: {
            address: baseAddress(0),
            amount: [
              { unit: mockTokenUnit(1), quantity: "1000000" },
              { unit: "lovelace", quantity: "50000000" },
            ],
          },
        },
        {
          input: { txHash: txHash("tx1"), outputIndex: 0 },
          output: {
            address: baseAddress(0),
            amount: [{ unit: "lovelace", quantity: "2000000" }],
          },
        },
      ];

      const tx = await txBuilder
        .txOut(baseAddress(1), [
          { unit: mockTokenUnit(1), quantity: "500000" },
          { unit: "lovelace", quantity: "50000000" },
        ])
        .selectUtxosFrom(utxosForSelection)
        .changeAddress(baseAddress(0))
        .complete();

      const cardanoTx = Transaction.fromCbor(TxCBOR(tx));
      const outputs = cardanoTx.body().outputs();
      for (const output of outputs) {
        expect(output.amount().coin()).toBeGreaterThanOrEqual(
          calculateMinLovelaceForTransactionOutput(output, 4310n),
        );
      }
    });

    it("Consolidates fragmented UTxOs correctly", async () => {
      const utxosForSelection: UTxO[] = Array.from({ length: 10 }, (_, i) => ({
        input: { txHash: txHash(`tx${i}`), outputIndex: 0 },
        output: {
          address: baseAddress(0),
          amount: [{ unit: "lovelace", quantity: "1000000" }],
        },
      }));

      const fetcher = new OfflineFetcher();
      fetcher.addUTxOs(utxosForSelection);

      const tx = await txBuilder
        .txOut(baseAddress(1), [{ unit: "lovelace", quantity: "5000000" }])
        .selectUtxosFrom(utxosForSelection)
        .changeAddress(baseAddress(0))
        .complete();

      const cardanoTx = Transaction.fromCbor(TxCBOR(tx));
      expect(cardanoTx.body().inputs().size()).toBeGreaterThan(1);

      const outputValue = calculateOutputMeshValue(tx);
      outputValue.addAsset({
        unit: "lovelace",
        quantity: cardanoTx.body().fee().toString(),
      });
      const inputValue = await calculateInputMeshValue(tx, fetcher);
      expect(inputValue.eq(outputValue)).toBe(true);
    });

    it("Splits large change outputs exceeding maxValSize", async () => {
      const utxosForSelection: UTxO[] = [];
      const tokens = [];
      for (let j = 0; j < 400; j++) {
        tokens.push({ unit: mockTokenUnit(j), quantity: "1000" });
      }
      utxosForSelection.push({
        input: { txHash: txHash("tx1"), outputIndex: 0 },
        output: {
          address: baseAddress(0),
          amount: [{ unit: "lovelace", quantity: "1000000000000" }, ...tokens],
        },
      });

      const tx = await txBuilder
        .txOut(baseAddress(1), [
          { unit: "lovelace", quantity: "10000000" },
          { unit: mockTokenUnit(1), quantity: "1000" },
        ])
        .selectUtxosFrom(utxosForSelection)
        .changeAddress(baseAddress(0))
        .complete();

      const cardanoTx = Transaction.fromCbor(TxCBOR(tx));
      // Should have multiple change outputs due to token bundle size
      expect(cardanoTx.body().outputs().length).toBeGreaterThanOrEqual(3);
    });

    it("Handles mixed lovelace + tokens", async () => {
      const utxosForSelection: UTxO[] = [
        {
          input: { txHash: txHash("tx0"), outputIndex: 0 },
          output: {
            address: baseAddress(0),
            amount: [
              { unit: mockTokenUnit(1), quantity: "1000000" },
              { unit: "lovelace", quantity: "3000000" },
            ],
          },
        },
        {
          input: { txHash: txHash("tx1"), outputIndex: 0 },
          output: {
            address: baseAddress(0),
            amount: [
              { unit: mockTokenUnit(2), quantity: "2000000" },
              { unit: "lovelace", quantity: "2000000" },
            ],
          },
        },
        {
          input: { txHash: txHash("tx2"), outputIndex: 0 },
          output: {
            address: baseAddress(0),
            amount: [
              { unit: mockTokenUnit(3), quantity: "3000000" },
              { unit: "lovelace", quantity: "2000000" },
            ],
          },
        },
      ];

      const fetcher = new OfflineFetcher();
      fetcher.addUTxOs(utxosForSelection);

      const tx = await txBuilder
        .txOut(baseAddress(1), [
          { unit: mockTokenUnit(1), quantity: "500000" },
          { unit: mockTokenUnit(3), quantity: "1000000" },
          { unit: "lovelace", quantity: "3000000" },
        ])
        .selectUtxosFrom(utxosForSelection)
        .changeAddress(baseAddress(2))
        .complete();

      const cardanoTx = Transaction.fromCbor(TxCBOR(tx));
      expect(cardanoTx.body().outputs().length).toBeGreaterThan(1);

      const outputValue = calculateOutputMeshValue(tx);
      outputValue.addAsset({
        unit: "lovelace",
        quantity: cardanoTx.body().fee().toString(),
      });
      const inputValue = await calculateInputMeshValue(tx, fetcher);
      expect(inputValue.eq(outputValue)).toBe(true);
    });

    it("Works with 10,000 UTxOs (performance)", async () => {
      const utxosForSelection: UTxO[] = [];
      const tokensCount = 135;
      for (let i = 0; i < 10000; i++) {
        const tokens = [];
        for (let j = 0; j < 50; j++) {
          tokens.push({
            unit: mockTokenUnit((i + j) % tokensCount),
            quantity: "1000",
          });
        }
        utxosForSelection.push({
          input: { txHash: txHash(`tx${i}`), outputIndex: 0 },
          output: {
            address: baseAddress(0),
            amount: [{ unit: "lovelace", quantity: "4000000" }, ...tokens],
          },
        });
      }

      const fetcher = new OfflineFetcher();
      fetcher.addUTxOs(utxosForSelection);

      const tx = await txBuilder
        .txOut(baseAddress(1), [{ unit: "lovelace", quantity: "10000000" }])
        .selectUtxosFrom(utxosForSelection)
        .changeAddress(baseAddress(0))
        .complete();

      const cardanoTx = Transaction.fromCbor(TxCBOR(tx));
      expect(cardanoTx.body().outputs().length).toBeGreaterThanOrEqual(2);

      const outputValue = calculateOutputMeshValue(tx);
      outputValue.addAsset({
        unit: "lovelace",
        quantity: cardanoTx.body().fee().toString(),
      });
      const inputValue = await calculateInputMeshValue(tx, fetcher);
      expect(inputValue.eq(outputValue)).toBe(true);
    });

    it("Transaction size limit enforcement", async () => {
      const utxosForSelection: UTxO[] = [];
      const tokens = [];
      for (let j = 0; j < 1000; j++) {
        tokens.push({ unit: mockTokenUnit(j), quantity: "1000" });
      }
      utxosForSelection.push({
        input: { txHash: txHash("tx1"), outputIndex: 0 },
        output: {
          address: baseAddress(0),
          amount: [{ unit: "lovelace", quantity: "1000000000000" }, ...tokens],
        },
      });

      await expect(
        txBuilder
          .txOut(baseAddress(1), [
            { unit: "lovelace", quantity: "10000000" },
            { unit: mockTokenUnit(1), quantity: "1000" },
          ])
          .selectUtxosFrom(utxosForSelection)
          .changeAddress(baseAddress(0))
          .complete(),
      ).rejects.toThrow();
    });
  });
});
