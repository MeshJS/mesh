import Codeblock from '../../../../ui/codeblock';
import SectionTwoCol from '../../../../common/sectionTwoCol';

export default function SetNativeScriptInput() {
  return (
    <SectionTwoCol
      sidebarTo="setNativeScriptInput"
      header="Set Native Script"
      leftFn={Left({})}
      rightFn={Right({})}
    />
  );
}

function Left({}) {
  let codeSnippet = ``;
  codeSnippet += `import { Transaction } from '@meshsdk/core';\n`;
  codeSnippet += `\n`;
  codeSnippet += `const tx = new Transaction({ initiator: wallet });\n`;
  codeSnippet += `tx.setNativeScriptInput(nativeScript, utxo);\n`;

  let codeUtxo = ``;
  codeUtxo += `{\n`;
  codeUtxo += `  input: {\n`;
  codeUtxo += `      outputIndex: number;\n`;
  codeUtxo += `      txHash: string;\n`;
  codeUtxo += `  };\n`;
  codeUtxo += `  output: {\n`;
  codeUtxo += `      address: string;\n`;
  codeUtxo += `      amount: Asset[];\n`;
  codeUtxo += `      dataHash?: string;\n`;
  codeUtxo += `      plutusData?: string;\n`;
  codeUtxo += `      scriptRef?: string;\n`;
  codeUtxo += `  };\n`;
  codeUtxo += `}\n`;

  let codeScript = ``;
  codeScript += `import type { NativeScript } from '@meshsdk/core';\n`;
  codeScript += `\n`;
  codeScript += `const nativeScript: NativeScript = {\n`;
  codeScript += `  type: 'all',\n`;
  codeScript += `  scripts:\n`;
  codeScript += `  [\n`;
  codeScript += `    {\n`;
  codeScript += `      type: 'before',\n`;
  codeScript += `      slot: '<insert slot here>'\n`;
  codeScript += `    },\n`;
  codeScript += `    {\n`;
  codeScript += `      type: 'sig',\n`;
  codeScript += `      keyHash: '<insert keyHash here>'\n`;
  codeScript += `    }\n`;
  codeScript += `  ]\n`;
  codeScript += `};\n`;

  return (
    <>
      <p>
        This function allows you to set the Native Script input for the
        transaction.
      </p>
      <Codeblock data={codeSnippet} isJson={false} />
      <p>
        where <code>NativeScript</code> has the following format:
      </p>
      <Codeblock data={codeScript} isJson={false} />
      <p>
        where <code>UTxO</code> has the following format (use one of our providers):
      </p>
      <Codeblock data={codeUtxo} isJson={false} />
    </>
  );
}

function Right({}) {
  return <></>;
}
