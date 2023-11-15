import Section from '../../../../common/section';
import Codeblock from '../../../../ui/codeblock';

export default function Complete() {
  return (
    <Section sidebarTo="complete" header="Complete" contentFn={Content()} />
  );
}

function Content() {
  let code = `mesh
  .complete(customizedTx?: MeshTxBuilderBody)`;
  let codeSync = `mesh
  .completeSync(customizedTx?: MeshTxBuilderBody)`;

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
        Use <code>.complete()</code> to complete the transaction building
        process:
      </p>

      <Codeblock data={code} isJson={false} />

      <p>
        Use <code>.completeSync()</code> to complete the transaction building
        process without indexing blockchain:
      </p>

      <Codeblock data={codeSync} isJson={false} />

      <p>
        Where <code>MeshTxBuilderBody</code> is an optional parameter. With
        supplying it builds the transaction with the object supplied.
      </p>
    </>
  );
}
