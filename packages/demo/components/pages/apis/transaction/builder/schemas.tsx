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

  let codeScriptTxIn = `ScriptTxIn = {
  type: 'Script';
  txIn: {
    txHash: string;
    txIndex: number;
    amount?: Asset[];
    address?: string;
  }
  scriptTxIn: {
    scriptSource?:
      | {
          type: 'Provided';
          script: PlutusScript;
        }
      | {
          type: 'Inline';
          txInInfo: ScriptSourceInfo;
        };
    datumSource?:
      | {
          type: 'Provided';
          data: BuilderData;
        }
      | {
          type: 'Inline';
          txHash: string;
          txIndex: number;
        };
    redeemer?: {
      data: BuilderData;
      exUnits: Budget;
    };
  }
}`;

  let codeScriptSourceInfo = `ScriptSourceInfo = {
  txHash: string;
  txIndex: number;
  spendingScriptHash?: string;
  version: LanguageVersion;
}
`;

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
      data: BuilderData;
    };
    referenceScript?: PlutusScript;
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
        script: PlutusScript;
      }
    | {
        type: 'Reference Script';
        txHash: string;
        txIndex: number;
        version: LanguageVersion;
      };
}`;

  let codeValidityRange = `ValidityRange = {
  invalidBefore?: number;
  invalidHereafter?: number;
}`;

  let codeBuilderData = `BuilderData =
  | {
    type: 'Mesh';
    content: Data;
  }
  | {
      type: 'Raw';
      content: string | object;
    };`;

  let codeRedeemer = `Redeemer = {
  data: BuilderData;
  exUnits: Budget;
}`;

  let codeMetadata = `Metadata = {
  tag: string;
  metadata: object;
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

  let codePlutusScript = `PlutusScript = {
  version: LanguageVersion;
  code: string;
}`;
  let codeLanguageVersion = `LanguageVersion = "V1" | "V2"`;

  return (
    <>
      <p>
        All the schemas used in the Mesh lower-level APIs can be found here.
      </p>

      <Codeblock data={codeMeshTxBuilderBody} isJson={false} />

      <p>
        Details of all the types which construct the{' '}
        <code>MeshTxBuilderBody</code>
        can be found below:
      </p>
      <code>TxIn</code>
      <Codeblock data={codeInput} isJson={false} />
      <code>PubKeyTxIn</code>
      <Codeblock data={codePubKeyTxIn} isJson={false} />
      <code>ScriptTxIn</code>
      <Codeblock data={codeScriptTxIn} isJson={false} />
      <code>ScriptSourceInfo</code>
      <Codeblock data={codeScriptSourceInfo} isJson={false} />
      <code>RefTxIn</code>
      <Codeblock data={codeRefTxIn} isJson={false} />
      <code>Output</code>
      <Codeblock data={codeOutput} isJson={false} />
      <code>MintItem</code>
      <Codeblock data={codeMintItem} isJson={false} />
      <code>ValidityRange</code>
      <Codeblock data={codeValidityRange} isJson={false} />
      <code>BuilderData</code>
      <Codeblock data={codeBuilderData} isJson={false} />
      <code>Redeemer</code>
      <Codeblock data={codeRedeemer} isJson={false} />
      <code>Metadata</code>
      <Codeblock data={codeMetadata} isJson={false} />
      <code>Asset</code>
      <Codeblock data={codeAsset} isJson={false} />
      <code>Data</code>
      <Codeblock data={codeData} isJson={false} />
      <code>PlutusScript</code>
      <Codeblock data={codePlutusScript} isJson={false} />
      <code>LanguageVersion</code>
      <Codeblock data={codeLanguageVersion} isJson={false} />
    </>
  );
}
