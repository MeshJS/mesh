import Section from '../../../../common/section';
import Codeblock from '../../../../ui/codeblock';

export default function Complete() {
  return (
    <Section sidebarTo="complete" header="Complete" contentFn={Content()} />
  );
}

function Content() {
  let code = `await mesh
  .complete(customizedTx?: MeshTxBuilderBody)`;
  let codeSync = `mesh
  .completeSync(customizedTx?: MeshTxBuilderBody)`;
  let codeSign = `const signedTx = mesh
  .completeSigning()`;

  return (
    <>
      <p>
        In the Mesh lower-level API, the transaction building process is concluded
        by using either the <code>.complete()</code> or <code>.completeSync()</code> method,
        at which point the <code>MeshTxBuilder</code> instance analyses and completes the serialization
        of the built transaction so that (if it is valid) it is ready to be submitted to the blockchain.
      </p>
      <p>
        You can also directly supply the optional parameter in{' '}
        <code>MeshTxBuilderBody</code> to build the transaction using the supplied object.
      </p>
      <p>
        Use <code>.complete()</code> (an async method) to complete the
        transaction building process:
      </p>

      <Codeblock data={code} isJson={false} />

      <p>
        Use <code>.completeSync()</code> to complete the transaction building
        process without indexing the blockchain:
      </p>

      <Codeblock data={codeSync} isJson={false} />

      <p>
        Use <code>.completeSigning()</code> to add private key signing to the
        witness set process without indexing the blockchain:
      </p>

      <Codeblock data={codeSign} isJson={false} />
    </>
  );
}
