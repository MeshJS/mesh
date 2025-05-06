import { MeshValue, UTxO } from "@meshsdk/common";
import { serializePlutusScript } from "@meshsdk/core";
import { resolveScriptRef, Transaction, TxCBOR } from "@meshsdk/core-cst";
import { OfflineFetcher } from "@meshsdk/provider";
import { MeshTxBuilder } from "@meshsdk/transaction";

import {
  alwaysSucceedCbor,
  alwaysSucceedHash,
  baseAddress,
  calculateInputMeshValue,
  calculateMinLovelaceForTransactionOutput,
  calculateOutputMeshValue,
  mockTokenUnit,
  txHash,
} from "../test-util";

describe("MeshTxBuilder - coin selection", () => {
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
    txBuilder = new MeshTxBuilder({ fetcher: offlineFetcher });
  });

  it("Transaction should select the correct utxos", async () => {
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
              unit: mockTokenUnit(1),
              quantity: "7000000",
            },
            {
              unit: "lovelace",
              quantity: "3000000",
            },
          ],
        },
      },
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
              quantity: "1000000",
            },
          ],
        },
      },
    ];
    const tx = await txBuilder
      .txIn(
        txHash("tx3"),
        0,
        [
          {
            unit: "lovelace",
            quantity: "3000000",
          },
        ],
        baseAddress(0),
        0,
      )
      .txOut(baseAddress(1), [
        {
          unit: mockTokenUnit(1),
          quantity: "1000000",
        },
        {
          unit: "lovelace",
          quantity: "3000000",
        },
      ])
      .selectUtxosFrom(utxosForSelection)
      .changeAddress(baseAddress(1))
      .complete();
    const cardanoTx = Transaction.fromCbor(TxCBOR(tx));
    expect(cardanoTx.body().outputs().length).toEqual(2);
  });

  it("Transaction should balance tx", async () => {
    const inputValue = 3000000n;
    const utxosForSelection: UTxO[] = [];
    const tx = await txBuilder
      .txIn(
        txHash("tx3"),
        0,
        [
          {
            unit: "lovelace",
            quantity: inputValue.toString(),
          },
        ],
        baseAddress(0),
        0,
      )
      .txOut(baseAddress(1), [
        {
          unit: "lovelace",
          quantity: "1000000",
        },
      ])
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

  it("Transaction should handle mint", async () => {
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

  it("Transaction should handle multiple outputs", async () => {
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

  it("Insufficient funds for token", async () => {
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
              quantity: "3000000",
            },
          ],
        },
      },
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
              quantity: "1000000",
            },
          ],
        },
      },
    ];

    await expect(
      txBuilder
        .txIn(
          txHash("tx3"),
          0,
          [
            {
              unit: "lovelace",
              quantity: "3000000",
            },
          ],
          baseAddress(0),
          0,
        )
        .txOut(baseAddress(1), [
          {
            unit: mockTokenUnit(1),
            quantity: "1000000",
          },
          {
            unit: "lovelace",
            quantity: "3000000",
          },
        ])
        .selectUtxosFrom(utxosForSelection)
        .changeAddress(baseAddress(1))
        .complete(),
    ).rejects.toThrow(`UTxO Balance Insufficient`);
  });

  it("Transaction should select multiple token types correctly", async () => {
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
              unit: mockTokenUnit(1),
              quantity: "1000000",
            },
            {
              unit: "lovelace",
              quantity: "3000000",
            },
          ],
        },
      },
      {
        input: {
          txHash: txHash("tx1"),
          outputIndex: 0,
        },
        output: {
          address: baseAddress(1),
          amount: [
            {
              unit: mockTokenUnit(2),
              quantity: "500000",
            },
            {
              unit: "lovelace",
              quantity: "2000000",
            },
          ],
        },
      },
    ];
    const tx = await txBuilder
      .txOut(baseAddress(1), [
        {
          unit: mockTokenUnit(1),
          quantity: "500000",
        },
        {
          unit: mockTokenUnit(2),
          quantity: "400000",
        },
        {
          unit: "lovelace",
          quantity: "2000000",
        },
      ])
      .selectUtxosFrom(utxosForSelection)
      .changeAddress(baseAddress(2))
      .complete();
    const cardanoTx = Transaction.fromCbor(TxCBOR(tx));

    expect(cardanoTx.body().outputs().length).toBeGreaterThanOrEqual(2);

    const outputs = cardanoTx.body().outputs();
    const changeOutput = outputs.find(
      (output) => output.address().toBech32() === baseAddress(2),
    );

    expect(changeOutput).toBeDefined();
  });

  it("Should ensure minimum ADA requirement for change output", async () => {
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
              unit: mockTokenUnit(1),
              quantity: "1000000",
            },
            {
              unit: "lovelace",
              quantity: "50000000",
            },
          ],
        },
      },
      {
        input: {
          txHash: txHash("tx1"),
          outputIndex: 0,
        },
        output: {
          address: baseAddress(0),
          amount: [
            {
              unit: "lovelace",
              quantity: "2000000",
            },
          ],
        },
      },
    ];

    const tx = await txBuilder
      .txOut(baseAddress(1), [
        {
          unit: mockTokenUnit(1),
          quantity: "500000",
        },
        {
          unit: "lovelace",
          quantity: "50000000",
        },
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

  it("Insufficient ADA for fee", async () => {
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
              quantity: "1000000", // Not enough to cover output + fee
            },
          ],
        },
      },
    ];

    await expect(
      txBuilder
        .txOut(baseAddress(1), [
          {
            unit: "lovelace",
            quantity: "950000", // This leaves too little for fee
          },
        ])
        .selectUtxosFrom(utxosForSelection)
        .changeAddress(baseAddress(0))
        .complete(),
    ).rejects.toThrow();
  });

  it("Should consolidate multiple UTXOs when needed", async () => {
    const utxosForSelection: UTxO[] = Array.from({ length: 10 }, (_, i) => ({
      input: {
        txHash: txHash(`tx${i}`),
        outputIndex: 0,
      },
      output: {
        address: baseAddress(0),
        amount: [
          {
            unit: "lovelace",
            quantity: "1000000", // 1 ADA each
          },
        ],
      },
    }));
    const fetcher = new OfflineFetcher();
    fetcher.addUTxOs(utxosForSelection);

    const tx = await txBuilder
      .txOut(baseAddress(1), [
        {
          unit: "lovelace",
          quantity: "5000000",
        },
      ])
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

  it("Should handle mixed token types with change correctly", async () => {
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
              unit: mockTokenUnit(1),
              quantity: "1000000",
            },
            {
              unit: "lovelace",
              quantity: "3000000",
            },
          ],
        },
      },
      {
        input: {
          txHash: txHash("tx1"),
          outputIndex: 0,
        },
        output: {
          address: baseAddress(0),
          amount: [
            {
              unit: mockTokenUnit(2),
              quantity: "2000000",
            },
            {
              unit: "lovelace",
              quantity: "2000000",
            },
          ],
        },
      },
      {
        input: {
          txHash: txHash("tx2"),
          outputIndex: 0,
        },
        output: {
          address: baseAddress(0),
          amount: [
            {
              unit: mockTokenUnit(3),
              quantity: "3000000",
            },
            {
              unit: "lovelace",
              quantity: "2000000",
            },
          ],
        },
      },
    ];
    const fetcher = new OfflineFetcher();
    fetcher.addUTxOs(utxosForSelection);
    const tx = await txBuilder
      .txOut(baseAddress(1), [
        {
          unit: mockTokenUnit(1),
          quantity: "500000",
        },
        {
          unit: mockTokenUnit(3),
          quantity: "1000000",
        },
        {
          unit: "lovelace",
          quantity: "3000000",
        },
      ])
      .selectUtxosFrom(utxosForSelection)
      .changeAddress(baseAddress(2))
      .complete();

    const cardanoTx = Transaction.fromCbor(TxCBOR(tx));

    expect(cardanoTx.body().outputs().length).toBeGreaterThan(1);

    const changeOutput = cardanoTx.body().outputs()[1];
    expect(changeOutput!.address().toBech32()).toBe(baseAddress(2));

    const multiAsset = changeOutput!.amount().multiasset();
    expect(multiAsset).toBeDefined();

    const outputValue = calculateOutputMeshValue(tx);
    outputValue.addAsset({
      unit: "lovelace",
      quantity: cardanoTx.body().fee().toString(),
    });
    const inputValue = await calculateInputMeshValue(tx, fetcher);
    expect(inputValue.eq(outputValue)).toBe(true);
  });

  it("Should handle fragmented UTXOs", async () => {
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
      const utxo = {
        input: {
          txHash: txHash(`tx${i}`),
          outputIndex: 0,
        },
        output: {
          address: baseAddress(0),
          amount: [
            {
              unit: "lovelace",
              quantity: "4000000",
            },
            ...tokens,
          ],
        },
      };
      utxosForSelection.push(utxo);
    }
    const fetcher = new OfflineFetcher();
    fetcher.addUTxOs(utxosForSelection);
    const tx = await txBuilder
      .txOut(baseAddress(1), [
        {
          unit: "lovelace",
          quantity: "10000000",
        },
      ])
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

  it("Should split huge UTXO", async () => {
    const utxosForSelection: UTxO[] = [];
    const tokens = [];
    for (let j = 0; j < 400; j++) {
      tokens.push({
        unit: mockTokenUnit(j),
        quantity: "1000",
      });
    }
    utxosForSelection.push({
      input: {
        txHash: txHash(`tx1`),
        outputIndex: 0,
      },
      output: {
        address: baseAddress(0),
        amount: [
          {
            unit: "lovelace",
            quantity: "1000000000000",
          },
          ...tokens,
        ],
      },
    });
    let inputValue = MeshValue.fromAssets([
      {
        unit: "lovelace",
        quantity: "1000000000000",
      },
      ...tokens,
    ]);
    const tx = await txBuilder
      .txOut(baseAddress(1), [
        {
          unit: "lovelace",
          quantity: "10000000",
        },
        {
          unit: mockTokenUnit(1),
          quantity: "1000",
        },
      ])
      .selectUtxosFrom(utxosForSelection)
      .changeAddress(baseAddress(0))
      .complete();
    const cardanoTx = Transaction.fromCbor(TxCBOR(tx));

    expect(cardanoTx.body().outputs().length).toEqual(5);
    for (const output of cardanoTx.body().outputs()) {
      expect(output.amount().coin()).toBeGreaterThanOrEqual(
        calculateMinLovelaceForTransactionOutput(output, 4310n),
      );
      const multiAsset = output.amount().multiasset();
      expect(multiAsset).toBeDefined();
    }
    const outputValue = calculateOutputMeshValue(tx);
    outputValue.addAsset({
      unit: "lovelace",
      quantity: cardanoTx.body().fee().toString(),
    });
    expect(inputValue.eq(outputValue)).toBe(true);
  });

  it("Should throw error on tx size exceed size limit", async () => {
    const utxosForSelection: UTxO[] = [];
    const tokens = [];
    for (let j = 0; j < 1000; j++) {
      tokens.push({
        unit: mockTokenUnit(j),
        quantity: "1000",
      });
    }
    utxosForSelection.push({
      input: {
        txHash: txHash(`tx1`),
        outputIndex: 0,
      },
      output: {
        address: baseAddress(0),
        amount: [
          {
            unit: "lovelace",
            quantity: "1000000000000",
          },
          ...tokens,
        ],
      },
    });
    await expect(
      txBuilder
        .txOut(baseAddress(1), [
          {
            unit: "lovelace",
            quantity: "10000000",
          },
          {
            unit: mockTokenUnit(1),
            quantity: "1000",
          },
        ])
        .selectUtxosFrom(utxosForSelection)
        .changeAddress(baseAddress(0))
        .complete(),
    ).rejects.toThrow();
  });
});
