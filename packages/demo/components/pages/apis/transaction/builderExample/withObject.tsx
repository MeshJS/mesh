import Link from 'next/link';
import Section from '../../../../common/section';
import Codeblock from '../../../../ui/codeblock';
import { Link as SmoothLink } from 'react-scroll';

export default function TransactionWithObject() {
  return (
    <Section
      sidebarTo="withObject"
      header="Build a transaction with an object"
      contentFn={Content()}
    />
  );
}

function Content() {
  let codeSnippet = ``;
  codeSnippet += `const myTx = {\n`;
  codeSnippet += `  inputs: [\n`;
  codeSnippet += `    {\n`;
  codeSnippet += `      type: 'PubKey',\n`;
  codeSnippet += `      txIn: {\n`;
  codeSnippet += `        txHash: '572bca237e440b596f4f71374b4b610a995095c6b62a6dcc8549089b93ba0e33',\n`;
  codeSnippet += `        txIndex: 0,\n`;
  codeSnippet += `      },\n`;
  codeSnippet += `    },\n`;
  codeSnippet += `    {\n`;
  codeSnippet += `      type: 'PubKey',\n`;
  codeSnippet += `      txIn: {\n`;
  codeSnippet += `        txHash: '572bca237e440b596f4f71374b4b610a995095c6b62a6dcc8549089b93ba0e33',\n`;
  codeSnippet += `        txIndex: 3,\n`;
  codeSnippet += `      },\n`;
  codeSnippet += `    },\n`;
  codeSnippet += `  ],\n`;
  codeSnippet += `  outputs: [\n`;
  codeSnippet += `    {\n`;
  codeSnippet += `      address: 'addr_test1qz8j439j54afpl4hw978xcw8qsa0dsmyd6wm9v8xzeyz7ucrj5rt3et7z59mvmmpxnejvn2scwmseezdq5h5fpw08z8s8d93my',\n`;
  codeSnippet += `      amount: [\n`;
  codeSnippet += `        { unit: 'lovelace', quantity: '2000000' },\n`;
  codeSnippet += `        { unit: 'baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc817006d65736874657374696e672e616461', quantity: '1' },\n`;
  codeSnippet += `      ],\n`;
  codeSnippet += `    },\n`;
  codeSnippet += `  ],\n`;
  codeSnippet += `  collaterals: [\n`;
  codeSnippet += `    {\n`;
  codeSnippet += `      type: 'PubKey',\n`;
  codeSnippet += `      txIn: {\n`;
  codeSnippet += `        txHash: '3fbdf2b0b4213855dd9b87f7c94a50cf352ba6edfdded85ecb22cf9ceb75f814',\n`;
  codeSnippet += `        txIndex: 6,\n`;
  codeSnippet += `      },\n`;
  codeSnippet += `    },\n`;
  codeSnippet += `  ],\n`;
  codeSnippet += `  requiredSignatures: [],\n`;
  codeSnippet += `  referenceInputs: [],\n`;
  codeSnippet += `  mints: [],\n`;
  codeSnippet += `  changeAddress: 'addr_test1vpw22xesfv0hnkfw4k5vtrz386tfgkxu6f7wfadug7prl7s6gt89x',\n`;
  codeSnippet += `  metadata: [],\n`;
  codeSnippet += `  validityRange: {},\n`;
  codeSnippet += `  signingKey: [\n`;
  codeSnippet += `    '5820xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',\n`;
  codeSnippet += `  ],\n`;
  codeSnippet += `};\n`;
  codeSnippet += `\n`;
  codeSnippet += `const signedTx = await mesh.complete(myTx);`;

  return (
    <>
      <p>
        One alternative to use the lower level APIs is to build the transaction
        with an object in type{' '}
        <a
          href="https://github.com/MeshJS/mesh/tree/main/packages/module/src/transaction/meshTxBuilder/type.ts"
          target="_blank"
        >
          MeshTxBuilderBody
        </a>
        .
        {/* , where <code> MeshTxBuilderBody</code> is an object with the following
        properties: */}
      </p>

      <p>
        The following shows a example of building the same transaction in the{' '}
        <SmoothLink
          to="withoutDependency"
          spy={true}
          smooth={true}
          duration={500}
          offset={-100}
        >
          Build a transaction without any dependency
        </SmoothLink>{' '}
        section with an object:
      </p>
      <Codeblock data={codeSnippet} isJson={false} />
    </>
  );
}
