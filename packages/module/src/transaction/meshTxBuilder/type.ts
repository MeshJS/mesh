import { Asset, Budget, Data } from '@mesh/common/types';

export type MeshTxBuilderBody = {
  inputs: TxIn[];
  outputs: Output[];
  collaterals: PubKeyTxIn[];
  requiredSignatures: string[];
  referenceInputs: RefTxIn[];
  mints: MintItem[];
  changeAddress: string;
  metadata: Metadata[];
  validityRange: ValidityRange;
  // certificates?: Certificate[];
  // withdrawals?: Record<StakeCredential, number>;
  signingKey: string[];
};

export type Output = {
  address: string;
  amount: Asset[];
  datum?: {
    type: 'Hash' | 'Inline';
    data: Data;
  };
  referenceScript?: string;
};
// export type Certificate = {};
// export type StakeCredential = {};
export type ValidityRange = {
  invalidBefore?: number;
  invalidHereafter?: number;
};

// Utilities

export type RequiredWith<T, K extends keyof T> = Required<T> &
  {
    [P in K]: Required<T[P]>;
  };

// TxIn Types
export type RefTxIn = { txHash: string; txIndex: number };
export type TxIn = PubKeyTxIn | ScriptTxIn;
export type PubKeyTxIn = { type: 'PubKey'; txIn: TxInParameter };
export type ScriptTxIn = {
  type: 'Script';
  txIn: TxInParameter;
  scriptTxIn: ScriptTxInParameter;
};

export type TxInParameter = {
  txHash: string;
  txIndex: number;
  amount?: Asset[];
  address?: string;
};

export type ScriptTxInParameter = {
  scriptSource?:
    | {
        type: 'Provided';
        scriptCBOR: string;
      }
    | {
        type: 'Inline';
        txInInfo: ScriptSourceInfo;
      };
  datumSource?:
    | {
        type: 'Provided';
        data: Data;
      }
    | {
        type: 'Inline';
        txHash: string;
        txIndex: number;
      };
  redeemer?: Redeemer;
};

export type ScriptSourceInfo = {
  txHash: string;
  txIndex: number;
  spendingScriptHash?: string;
};

// Mint Types
export type MintItem = {
  type: 'Plutus' | 'Native';
  policyId: string;
  assetName: string;
  amount: number;
  redeemer?: Redeemer;
  scriptSource?:
    | {
        type: 'Provided';
        cbor: string;
      }
    | {
        type: 'Reference Script';
        txHash: string;
        txIndex: number;
      };
};

export type Redeemer = {
  data: Data;
  exUnits: Budget;
};

export type Metadata = {
  tag: string;
  metadata: object;
};
