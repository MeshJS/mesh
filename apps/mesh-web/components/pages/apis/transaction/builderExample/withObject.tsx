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
  let codeSnippet = `const meshTxBody: MeshTxBuilderBody = {
  inputs: [
    {
      type: "PubKey",
      txIn: {
        txHash: txHash1,
        txIndex: txIndex1,
      },
    },
    {
      type: "PubKey",
      txIn: {
        txHash: txHash2,
        txIndex: txIndex2,
      },
    },
  ],
  outputs: [
    {
      address: walletAddress,
      amount: [{ unit: "lovelace", quantity: "1000000" }],
    },
  ],
  collaterals: [
    {
      type: "PubKey",
      txIn: {
        txHash: "ee8369ffadd6ed6efdd939639b393f08974fca388b2c43d03a96a1fa4840c5f8",
        txIndex: 0,
      },
    },
  ],
  requiredSignatures: [],
  referenceInputs: [],
  mints: [],
  changeAddress: walletAddress,
  metadata: [],
  validityRange: {},
  signingKey: [skey],
};

await mesh.complete(meshTxBody);
const signedTx = mesh.completeSigning();`;

  return (
    <>
      <p>
        One alternative to use the lower level APIs is to build the transaction
        with an object in type{' '}
        <Link href="/apis/transaction/builder#schemas">MeshTxBuilderBody</Link>.
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
      <p>
        <a href="https://github.com/sidan-lab/mesh-lower-level-api-demo/blob/mesh-docs/src/pages/index.tsx#L112C1-L166C1">
          Full Code Snippet in Github
        </a>
      </p>
    </>
  );
}
