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
        In the Mesh lower level APIs, transaction building process is finished
        by the <code>.complete()</code> or <code>.completeSync()</code> method,
        where the <code>MeshTxBuilder</code> instance would look into your
        transaction building process so far and serialize the transaction ready
        to be submitted to the blockchain.
      </p>
      <p>
        You could also directly supplying the optional parameter in{' '}
        <code>MeshTxBuilderBody</code> to build the transaction with the object
        supplied.
      </p>
      <p>
        Use <code>.complete()</code> (an async method) to complete the
        transaction building process:
      </p>

      <Codeblock data={code} isJson={false} />

      <p>
        Use <code>.completeSync()</code> to complete the transaction building
        process without indexing blockchain:
      </p>

      <Codeblock data={codeSync} isJson={false} />

      <p>
        Use <code>.completeSigning()</code> to add private key signing to the
        witness set process without indexing blockchain:
      </p>

      <Codeblock data={codeSign} isJson={false} />
    </>
  );
}
