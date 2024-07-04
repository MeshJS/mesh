import { MeshTxBuilderCore } from './meshTxBuilderCore';
import { DEFAULT_PROTOCOL_PARAMETERS } from '@mesh/common/constants';
import { Protocol } from '@mesh/common/types';
import { MintItem, PubKeyTxIn, RefTxIn } from './type';
import { expect } from 'vitest';

export const correctInitState = (txBuilder: MeshTxBuilderCore): void => {
    expect(txBuilder.txHex).toBe('');
    expect(txBuilder.txBuilder).toBeDefined();
    expect(txBuilder.txEvaluationMultiplier).toBe(1.1);
    expect(txBuilder['_protocolParams']).toEqual(DEFAULT_PROTOCOL_PARAMETERS);
    expect(txBuilder['addingScriptInput']).toBeFalsy();
    expect(txBuilder['addingPlutusMint']).toBeFalsy();
    expect(txBuilder['meshTxBuilderBody']).toBeDefined();
    expect(txBuilder['mintItem']).toBeUndefined();
    expect(txBuilder['txInQueueItem']).toBeUndefined();
    expect(txBuilder['collateralQueueItem']).toBeUndefined();
    expect(txBuilder['refScriptTxInQueueItem']).toBeUndefined();
};

export const setupMockTxBuilder = (txBuilder: MeshTxBuilderCore): void => {
    txBuilder.txHex = 'DummyHex';
    txBuilder.txEvaluationMultiplier = 2.0;
    txBuilder['_protocolParams'] = MOCK_PROTOCOL_PARAMETERS;
    txBuilder['addingScriptInput'] = true;
    txBuilder['addingPlutusMint'] = true;
    txBuilder['mintItem'] = MOCK_MINT_ITEM;
    txBuilder['txInQueueItem'] = MOCK_TX_IN;
    txBuilder['collateralQueueItem'] = MOCK_TX_IN;
    txBuilder['refScriptTxInQueueItem'] = MOCK_REF_TX_IN;
};

export const MOCK_PROTOCOL_PARAMETERS: Protocol = {
    epoch: 10,
    coinsPerUTxOSize: '4312',
    priceMem: 0.0573,
    priceStep: 0.0000730,
    minFeeA: 45,
    minFeeB: 155385,
    keyDeposit: '2100000',
    maxTxSize: 16384,
    maxValSize: '5000',
    poolDeposit: '500000000',
    maxCollateralInputs: 4,
    decentralisation: 0,
    maxBlockSize: 98304,
    collateralPercent: 150,
    maxBlockHeaderSize: 1100,
    minPoolCost: '320000000',
    maxTxExMem: '19000000',
    maxTxExSteps: '11000000000',
    maxBlockExMem: '90000000',
    maxBlockExSteps: '50000000000',
};

export const MOCK_MINT_ITEM: MintItem = {
    type: 'Plutus',
    policyId: 'MockPolicyId',
    assetName: 'AssetName',
    amount: '1',
};

export const MOCK_TX_IN: PubKeyTxIn = {
    type: 'PubKey',
    txIn: {
        txHash: 'string',
        txIndex: 0,
    },
};

export const MOCK_REF_TX_IN: RefTxIn = {
    txHash: 'MockTxHash',
    txIndex: 0,
};