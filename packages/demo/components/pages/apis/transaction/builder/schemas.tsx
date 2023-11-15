import Section from '../../../../common/section';
import Codeblock from '../../../../ui/codeblock';

export default function Schemas() {
  return <Section sidebarTo="schemas" header="Schemas" contentFn={Content()} />;
}

function Content() {
  let codeMeshTxBuilderBody = ``;
  codeMeshTxBuilderBody += `MeshTxBuilderBody = {\n`;
  codeMeshTxBuilderBody += `  inputs: TxIn[]\n`;
  codeMeshTxBuilderBody += `  outputs: Output[];\n`;
  codeMeshTxBuilderBody += `  collaterals: PubKeyTxIn[];\n`;
  codeMeshTxBuilderBody += `  requiredSignatures: string[];\n`;
  codeMeshTxBuilderBody += `  referenceInputs: RefTxIn[];\n`;
  codeMeshTxBuilderBody += `  mints: MintItem[];\n`;
  codeMeshTxBuilderBody += `  changeAddress: string;\n`;
  codeMeshTxBuilderBody += `  metadata: Metadata[];\n`;
  codeMeshTxBuilderBody += `  validityRange: ValidityRange;\n`;
  codeMeshTxBuilderBody += `  signingKey: string[];\n`;
  codeMeshTxBuilderBody += `}\n`;

  let codeInput = ``;
  codeInput += `TxIn = PubKeyTxIn | ScriptTxIn;\n`;

  let codePubKeyTxIn = `PubKeyTxIn = {
  type: 'PubKey';
  txIn: {
    txHash: string;
    txIndex: number;
    amount?: Asset[];
    address?: string;
  }
}`;

  let codeScriptTxIn = `PubKeyTxIn = {
  type: 'Script';
  txIn: {
    txHash: string;
    txIndex: number;
    amount?: Asset[];
    address?: string;
  }
  scriptTxIn: {
    scriptSource?: {
      txHash: string;
      txIndex: number;
      spendingScriptHash?: string;
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
    redeemer?: {
      data: Data;
      exUnits: Budget;
    };
  }
}`;

  let codeRefTxIn = `RefTxIn = {
  txHash: string;
  txIndex: number;
}
`;

  let codeOutput = ``;
  codeOutput += `Output = {
    address: string;
    amount: Asset[];
    datum?: {
      type: 'Hash' | 'Inline';
      data: Data;
    };
    referenceScript?: string;
}`;

  let codeMintItem = `MintItem = {
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
}`;

  let codeRedeemer = `Redeemer = {
  data: Data;
  exUnits: Budget;
}`;

  let codeMetadata = `Metadata = {
  tag: string;
  metadata: object;
}`;

  let codeValidityRange = `ValidityRange = {
  invalidBefore?: number;
  invalidHereafter?: number;
}`;

  let codeAsset = ``;
  codeAsset += `Asset = {\n`;
  codeAsset += `  unit: string;\n`;
  codeAsset += `  quantity: string;\n`;
  codeAsset += `}\n`;

  let codeData = ``;
  codeData += `Data = string |\n`;
  codeData += `       number |\n`;
  codeData += `       Array<Data> |\n`;
  codeData += `       Map<Data, Data> |\n`;
  codeData += `       {\n`;
  codeData += `         alternative: number;\n`;
  codeData += `         fields: Array<Data>;\n`;
  codeData += `       }`;

  return (
    <>
      <p>
        All the schemas utilizing in the Mesh lower level APIs could be found
        here.
      </p>

      <Codeblock data={codeMeshTxBuilderBody} isJson={false} />

      <p>
        Detail types in constructing the{' '}
        <code>MeshTxBuilderBody can be found here</code>
      </p>
      <code>TxIn</code>
      <Codeblock data={codeInput} isJson={false} />
      <code>PubKeyTxIn</code>
      <Codeblock data={codePubKeyTxIn} isJson={false} />
      <code>ScriptTxIn</code>
      <Codeblock data={codeScriptTxIn} isJson={false} />
      <code>RefTxIn</code>
      <Codeblock data={codeRefTxIn} isJson={false} />
      <code>Output</code>
      <Codeblock data={codeOutput} isJson={false} />
      <code>MintItem</code>
      <Codeblock data={codeMintItem} isJson={false} />
      <code>Redeemer</code>
      <Codeblock data={codeRedeemer} isJson={false} />
      <code>Metadata</code>
      <Codeblock data={codeMetadata} isJson={false} />
      <code>ValidityRange</code>
      <Codeblock data={codeValidityRange} isJson={false} />
      <code>Asset</code>
      <Codeblock data={codeAsset} isJson={false} />
      <code>Data</code>
      <Codeblock data={codeData} isJson={false} />
    </>
  );
}
