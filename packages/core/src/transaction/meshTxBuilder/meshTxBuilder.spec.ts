import { describe, it, beforeEach } from 'vitest';
import { MeshTxBuilderCore } from './meshTxBuilderCore';
import { correctInitState, setupMockTxBuilder } from './testUtils';

describe('MeshTxBuilderCore', () => {
  let txBuilder: MeshTxBuilderCore;

  beforeEach(() => {
    txBuilder = new MeshTxBuilderCore();
  });

  it('should initialize all properties to their default values in the constructor', () => {
    correctInitState(txBuilder);
  });

  it('should reset all properties to their initial state when reset method is called', () => {
    setupMockTxBuilder(txBuilder);
    txBuilder.reset();
    correctInitState(txBuilder);
  });
});