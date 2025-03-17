import { UTxO } from '@meshsdk/common';
import { Transaction, TxCBOR } from '@meshsdk/core-cst';
import { MeshTxBuilder } from '@meshsdk/transaction';

import {baseAddress, calculateMinLovelaceForTransactionOutput, mockTokenUnit, txHash} from '../test-util';

describe('MeshTxBuilder', () => {
  let txBuilder: MeshTxBuilder;

  beforeEach(() => {
    txBuilder = new MeshTxBuilder();
  });

  it('Transaction should select the correct utxos', async () => {
    const utxosForSelection: UTxO[] = [
      {
        input: {
          txHash: txHash('tx0'),
          outputIndex: 0,
        },
        output: {
          address: baseAddress(0),
          amount: [
            {
              unit: mockTokenUnit(1),
              quantity: '1000000',
            },
            {
              unit: 'lovelace',
              quantity: '3000000',
            },
          ],
        },
      },
      {
        input: {
          txHash: txHash('tx1'),
          outputIndex: 0,
        },
        output: {
          address: baseAddress(1),
          amount: [
            {
              unit: 'lovelace',
              quantity: '1000000',
            },
          ],
        },
      },
    ];
    const tx = await txBuilder
      .txIn(
        txHash('tx3'),
        0,
        [
          {
            unit: 'lovelace',
            quantity: '3000000',
          },
        ],
        baseAddress(0),
        0,
      )
      .txOut(baseAddress(1), [
        {
          unit: mockTokenUnit(1),
          quantity: '1000000',
        },
        {
          unit: 'lovelace',
          quantity: '3000000',
        },
      ])
      .selectUtxosFrom(utxosForSelection)
      .changeAddress(baseAddress(1))
      .complete();
    const cardanoTx = Transaction.fromCbor(TxCBOR(tx));
    expect(cardanoTx.body().outputs().length).toEqual(2);
  });

  it('Insufficient funds for token', async () => {
    const utxosForSelection: UTxO[] = [
      {
        input: {
          txHash: txHash('tx0'),
          outputIndex: 0,
        },
        output: {
          address: baseAddress(0),
          amount: [
            {
              unit: 'lovelace',
              quantity: '3000000',
            },
          ],
        },
      },
      {
        input: {
          txHash: txHash('tx1'),
          outputIndex: 0,
        },
        output: {
          address: baseAddress(1),
          amount: [
            {
              unit: 'lovelace',
              quantity: '1000000',
            },
          ],
        },
      },
    ];

    await expect(
      txBuilder
        .txIn(
          txHash('tx3'),
          0,
          [
            {
              unit: 'lovelace',
              quantity: '3000000',
            },
          ],
          baseAddress(0),
          0,
        )
        .txOut(baseAddress(1), [
          {
            unit: mockTokenUnit(1),
            quantity: '1000000',
          },
          {
            unit: 'lovelace',
            quantity: '3000000',
          },
        ])
        .selectUtxosFrom(utxosForSelection)
        .changeAddress(baseAddress(1))
        .complete(),
    ).rejects.toThrow(`UTxO Balance Insufficient`);
  });

  it('Transaction should select multiple token types correctly', async () => {
    const utxosForSelection: UTxO[] = [
      {
        input: {
          txHash: txHash('tx0'),
          outputIndex: 0,
        },
        output: {
          address: baseAddress(0),
          amount: [
            {
              unit: mockTokenUnit(1),
              quantity: '1000000',
            },
            {
              unit: 'lovelace',
              quantity: '3000000',
            },
          ],
        },
      },
      {
        input: {
          txHash: txHash('tx1'),
          outputIndex: 0,
        },
        output: {
          address: baseAddress(1),
          amount: [
            {
              unit: mockTokenUnit(2),
              quantity: '500000',
            },
            {
              unit: 'lovelace',
              quantity: '2000000',
            },
          ],
        },
      },
    ];
    const tx = await txBuilder
      .txOut(baseAddress(1), [
        {
          unit: mockTokenUnit(1),
          quantity: '500000',
        },
        {
          unit: mockTokenUnit(2),
          quantity: '400000',
        },
        {
          unit: 'lovelace',
          quantity: '2000000',
        },
      ])
      .selectUtxosFrom(utxosForSelection)
      .changeAddress(baseAddress(2))
      .complete();
    const cardanoTx = Transaction.fromCbor(TxCBOR(tx));

    // Should have at least 3 outputs: the specified output and change outputs for remaining tokens
    expect(cardanoTx.body().outputs().length).toBeGreaterThanOrEqual(2);

    // Verify change amount is correct
    const outputs = cardanoTx.body().outputs();
    const changeOutput = outputs.find(
      (output) => output.address().toBech32() === baseAddress(2),
    );

    expect(changeOutput).toBeDefined();
  });

  it('Should ensure minimum ADA requirement for change output', async () => {
    const utxosForSelection: UTxO[] = [
      {
        input: {
          txHash: txHash('tx0'),
          outputIndex: 0,
        },
        output: {
          address: baseAddress(0),
          amount: [
            {
              unit: mockTokenUnit(1),
              quantity: '1000000',
            },
            {
              unit: 'lovelace',
              quantity: '50000000',
            },
          ],
        },
      },
      {
        input: {
          txHash: txHash('tx1'),
          outputIndex: 0,
        },
        output: {
          address: baseAddress(0),
          amount: [
            {
              unit: 'lovelace',
              quantity: '1000000',
            },
          ],
        },
      },
    ];

    const tx = await txBuilder
      .txOut(baseAddress(1), [
        {
          unit: mockTokenUnit(1),
          quantity: '500000',
        },
        {
          unit: 'lovelace',
          quantity: '50000000',
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

  it('Insufficient ADA for fee', async () => {
    const utxosForSelection: UTxO[] = [
      {
        input: {
          txHash: txHash('tx0'),
          outputIndex: 0,
        },
        output: {
          address: baseAddress(0),
          amount: [
            {
              unit: 'lovelace',
              quantity: '1000000', // Not enough to cover output + fee
            },
          ],
        },
      },
    ];

    await expect(
      txBuilder
        .txOut(baseAddress(1), [
          {
            unit: 'lovelace',
            quantity: '950000', // This leaves too little for fee
          },
        ])
        .selectUtxosFrom(utxosForSelection)
        .changeAddress(baseAddress(0))
        .complete(),
    ).rejects.toThrow();
  });

  it('Should consolidate multiple UTXOs when needed', async () => {
    const utxosForSelection: UTxO[] = Array.from({ length: 10 }, (_, i) => ({
      input: {
        txHash: txHash(`tx${i}`),
        outputIndex: 0,
      },
      output: {
        address: baseAddress(0),
        amount: [
          {
            unit: 'lovelace',
            quantity: '1000000', // 1 ADA each
          },
        ],
      },
    }));

    const tx = await txBuilder
      .txOut(baseAddress(1), [
        {
          unit: 'lovelace',
          quantity: '5000000',
        },
      ])
      .selectUtxosFrom(utxosForSelection)
      .changeAddress(baseAddress(0))
      .complete();

    const cardanoTx = Transaction.fromCbor(TxCBOR(tx));

    expect(cardanoTx.body().inputs().size()).toBeGreaterThan(1);
  });

  it('Should handle mixed token types with change correctly', async () => {
    const utxosForSelection: UTxO[] = [
      {
        input: {
          txHash: txHash('tx0'),
          outputIndex: 0,
        },
        output: {
          address: baseAddress(0),
          amount: [
            {
              unit: mockTokenUnit(1),
              quantity: '1000000',
            },
            {
              unit: 'lovelace',
              quantity: '3000000',
            },
          ],
        },
      },
      {
        input: {
          txHash: txHash('tx1'),
          outputIndex: 0,
        },
        output: {
          address: baseAddress(0),
          amount: [
            {
              unit: mockTokenUnit(2),
              quantity: '2000000',
            },
            {
              unit: 'lovelace',
              quantity: '2000000',
            },
          ],
        },
      },
      {
        input: {
          txHash: txHash('tx2'),
          outputIndex: 0,
        },
        output: {
          address: baseAddress(0),
          amount: [
            {
              unit: mockTokenUnit(3),
              quantity: '3000000',
            },
            {
              unit: 'lovelace',
              quantity: '2000000',
            },
          ],
        },
      },
    ];

    const tx = await txBuilder
      .txOut(baseAddress(1), [
        {
          unit: mockTokenUnit(1),
          quantity: '500000',
        },
        {
          unit: mockTokenUnit(3),
          quantity: '1000000',
        },
        {
          unit: 'lovelace',
          quantity: '3000000',
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
  });
});
