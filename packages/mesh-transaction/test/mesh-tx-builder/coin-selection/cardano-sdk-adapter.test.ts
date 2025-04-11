import { Cardano as CSDK } from '@cardano-sdk/core';
import * as CardanoSelection from '@cardano-sdk/input-selection';

import { Asset, Output, TxIn, UTxO } from '@meshsdk/common';

import {
  BuilderCallbacksSdkBridge,
  CardanoSdkInputSelector,
} from '../../../src/mesh-tx-builder/coin-selection';
import {
  BuilderCallbacks,
  ImplicitValue,
} from '../../../src/mesh-tx-builder/coin-selection/coin-selection-interface';

describe('CardanoSdkInputSelector and BuilderCallbacksSdkBridge', () => {
  let mockBuilderCallbacks: BuilderCallbacks;
  let inputSelector: CardanoSdkInputSelector;
  let bridge: BuilderCallbacksSdkBridge;

  beforeEach(() => {
    mockBuilderCallbacks = {
      computeMinimumCost: async function (
        this: BuilderCallbacks,
        selectionSkeleton,
      ) {
        return {
          fee: 100n,
          redeemers: [],
        };
      },
      tokenBundleSizeExceedsLimit: function (
        this: BuilderCallbacks,
        tokenBundle,
      ) {
        return false;
      },
      computeMinimumCoinQuantity: function (this: BuilderCallbacks, output) {
        return 1000000n;
      },
      maxSizeExceed: async function (
        this: BuilderCallbacks,
        selectionSkeleton,
      ) {
        return false;
      },
    };

    jest.spyOn(mockBuilderCallbacks, 'computeMinimumCost');
    jest.spyOn(mockBuilderCallbacks, 'tokenBundleSizeExceedsLimit');
    jest.spyOn(mockBuilderCallbacks, 'computeMinimumCoinQuantity');
    jest.spyOn(mockBuilderCallbacks, 'maxSizeExceed');

    const utxoMap = new Map<string, UTxO>();
    const usedUtxos = new Set<string>();

    bridge = new BuilderCallbacksSdkBridge(
      mockBuilderCallbacks,
      utxoMap,
      usedUtxos,
    );
    inputSelector = new CardanoSdkInputSelector(mockBuilderCallbacks);
  });

  const createMockUTxO = (
    txHash: string,
    outputIndex: number,
    amount: Asset[],
  ): UTxO => ({
    input: {
      txHash,
      outputIndex,
    },
    output: {
      address: 'addr_test1234',
      amount,
      scriptRef: undefined,
      scriptHash: undefined,
      plutusData: undefined,
      dataHash: undefined,
    },
  });

  const createMockTxIn = (
    txHash: string,
    txIndex: number,
    amount: Asset[],
  ): TxIn => ({
    type: 'PubKey',
    txIn: {
      txHash,
      txIndex,
      amount,
      address: 'addr_test1234',
      scriptSize: 0,
    },
  });

  describe('BuilderCallbacksSdkBridge', () => {
    it('should compute minimum coin quantity correctly', () => {
      const mockOutput: CSDK.TxOut = {
        address: <CSDK.PaymentAddress>'addr_test1234',
        value: { coins: 1000000n },
      };

      const result = bridge.computeMinimumCoinQuantity(mockOutput);
      expect(result).toBe(1000000n);
      expect(
        mockBuilderCallbacks.computeMinimumCoinQuantity,
      ).toHaveBeenCalled();
    });

    it('should compute minimum cost correctly', async () => {
      const mockSelectionSkeleton: CardanoSelection.SelectionSkeleton = {
        inputs: new Set(),
        outputs: new Set(),
        change: [],
        fee: 100n,
      };

      const result = await bridge.computeMinimumCost(mockSelectionSkeleton);
      expect(result.fee).toBe(100n);
      expect(mockBuilderCallbacks.computeMinimumCost).toHaveBeenCalled();
    });

    it('should check token bundle size limit correctly', () => {
      const mockTokenBundle = new Map<CSDK.AssetId, bigint>([
        [<CSDK.AssetId>'token1', 100n],
      ]);
      const result = bridge.tokenBundleSizeExceedsLimit(mockTokenBundle);
      expect(result).toBe(false);
      expect(
        mockBuilderCallbacks.tokenBundleSizeExceedsLimit,
      ).toHaveBeenCalled();
    });
  });

  describe('CardanoSdkInputSelector', () => {
    it('should select inputs and calculate change correctly', async () => {
      const preselectedUtxos: TxIn[] = [
        createMockTxIn('tx1', 0, [{ unit: 'lovelace', quantity: '2000000' }]),
      ];

      const outputs: Output[] = [
        {
          address: 'addr_test5678',
          amount: [{ unit: 'lovelace', quantity: '1500000' }],
        },
      ];

      const implicitValue: ImplicitValue = {
        withdrawals: 0n,
        deposit: 0n,
        reclaimDeposit: 0n,
        mint: [],
      };

      const availableUtxos: UTxO[] = [
        createMockUTxO('tx2', 0, [{ unit: 'lovelace', quantity: '3000000' }]),
        createMockUTxO('tx3', 0, [{ unit: 'lovelace', quantity: '4000000' }]),
      ];

      const result = await inputSelector.select(
        preselectedUtxos,
        outputs,
        implicitValue,
        availableUtxos,
        'addr_test_change',
      );

      expect(result).toBeDefined();
      expect(result.newInputs.size).toBeGreaterThanOrEqual(0);
      expect(result.change.length).toBeGreaterThanOrEqual(0);
      expect(result.fee).toBeDefined();
      expect(mockBuilderCallbacks.computeMinimumCost).toHaveBeenCalled();
    });

    it('should handle tokens correctly', async () => {
      const preselectedUtxos: TxIn[] = [];
      const outputs: Output[] = [
        {
          address: 'addr_test5678',
          amount: [
            { unit: 'lovelace', quantity: '1000000' },
            { unit: 'token1', quantity: '100' },
          ],
        },
      ];

      const implicitValue: ImplicitValue = {
        withdrawals: 0n,
        deposit: 0n,
        reclaimDeposit: 0n,
        mint: [],
      };

      const availableUtxos: UTxO[] = [
        createMockUTxO('tx1', 0, [
          { unit: 'lovelace', quantity: '3000100' },
          { unit: 'token1', quantity: '200' },
        ]),
      ];

      const result = await inputSelector.select(
        preselectedUtxos,
        outputs,
        implicitValue,
        availableUtxos,
        'addr_test_change',
      );

      expect(result).toBeDefined();
      expect(result.newInputs.size).toBeGreaterThan(0);
      expect(
        mockBuilderCallbacks.tokenBundleSizeExceedsLimit,
      ).toHaveBeenCalled();
    });

    it('should handle implicit values correctly', async () => {
      const preselectedUtxos: TxIn[] = [];
      const outputs: Output[] = [
        {
          address: 'addr_test5678',
          amount: [{ unit: 'lovelace', quantity: '1500000' }],
        },
      ];

      const implicitValue: ImplicitValue = {
        withdrawals: 1000000n,
        deposit: 500000n,
        reclaimDeposit: 200000n,
        mint: [{ unit: 'token1', quantity: '100' }],
      };

      const availableUtxos: UTxO[] = [
        createMockUTxO('tx1', 0, [{ unit: 'lovelace', quantity: '3000000' }]),
      ];

      const result = await inputSelector.select(
        preselectedUtxos,
        outputs,
        implicitValue,
        availableUtxos,
        'addr_test_change',
      );

      expect(result).toBeDefined();
      expect(result.newInputs.size).toBeGreaterThanOrEqual(0);
      expect(mockBuilderCallbacks.computeMinimumCost).toHaveBeenCalled();
    });
    it('should handle multiple outputs correctly', async () => {
      const preselectedUtxos: TxIn[] = [];
      const outputs: Output[] = [
        {
          address: 'addr_test1234',
          amount: [{ unit: 'lovelace', quantity: '1000000' }],
        },
        {
          address: 'addr_test5678',
          amount: [{ unit: 'lovelace', quantity: '2000000' }],
        },
      ];

      const implicitValue: ImplicitValue = {
        withdrawals: 0n,
        deposit: 0n,
        reclaimDeposit: 0n,
        mint: [],
      };

      const availableUtxos: UTxO[] = [
        createMockUTxO('tx1', 0, [{ unit: 'lovelace', quantity: '5000000' }]),
      ];

      const result = await inputSelector.select(
        preselectedUtxos,
        outputs,
        implicitValue,
        availableUtxos,
        'addr_test_change',
      );

      expect(result).toBeDefined();
      expect(result.newInputs.size).toBeGreaterThan(0);
      expect(mockBuilderCallbacks.computeMinimumCost).toHaveBeenCalled();
    });

    it('should handle preselected UTxOs correctly', async () => {
      const preselectedUtxos: TxIn[] = [
        {
          type: 'PubKey',
          txIn: {
            txHash: 'tx1',
            txIndex: 0,
            amount: [{ unit: 'lovelace', quantity: '20000000' }],
            address: 'addr_test1234',
            scriptSize: 0,
          },
        },
      ];
      const outputs: Output[] = [
        {
          address: 'addr_test1234',
          amount: [{ unit: 'lovelace', quantity: '1000000' }],
        },
      ];

      const implicitValue: ImplicitValue = {
        withdrawals: 0n,
        deposit: 0n,
        reclaimDeposit: 0n,
        mint: [],
      };

      const availableUtxos: UTxO[] = [
        createMockUTxO('tx1', 0, [{ unit: 'lovelace', quantity: '2000000' }]),
        createMockUTxO('tx2', 0, [{ unit: 'lovelace', quantity: '3000000' }]),
      ];

      const result = await inputSelector.select(
        preselectedUtxos,
        outputs,
        implicitValue,
        availableUtxos,
        'addr_test_change',
      );

      expect(result).toBeDefined();
      expect(result.newInputs.size).toBe(0); // No new inputs needed
      expect(mockBuilderCallbacks.computeMinimumCost).toHaveBeenCalled();
    });

    it('should handle multi-asset transactions correctly', async () => {
      const preselectedUtxos: TxIn[] = [];
      const outputs: Output[] = [
        {
          address: 'addr_test1234',
          amount: [
            { unit: 'lovelace', quantity: '1500000' },
            { unit: 'token1', quantity: '50' },
            { unit: 'token2', quantity: '100' },
          ],
        },
      ];

      const implicitValue: ImplicitValue = {
        withdrawals: 0n,
        deposit: 0n,
        reclaimDeposit: 0n,
        mint: [],
      };

      const availableUtxos: UTxO[] = [
        createMockUTxO('tx1', 0, [
          { unit: 'lovelace', quantity: '2000000' },
          { unit: 'token1', quantity: '100' },
        ]),
        createMockUTxO('tx2', 0, [
          { unit: 'lovelace', quantity: '1000000' },
          { unit: 'token2', quantity: '200' },
        ]),
      ];

      const result = await inputSelector.select(
        preselectedUtxos,
        outputs,
        implicitValue,
        availableUtxos,
        'addr_test_change',
      );

      expect(result).toBeDefined();
      expect(result.newInputs.size).toBeGreaterThan(1); // Should select both UTxOs
      expect(mockBuilderCallbacks.computeMinimumCost).toHaveBeenCalled();
    });
  });
});
