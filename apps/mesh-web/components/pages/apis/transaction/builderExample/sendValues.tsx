import Section from '../../../../common/section';
import Codeblock from '../../../../ui/codeblock';

export default function SendValues() {
  return (
    <Section
      sidebarTo="sendValues"
      header="Build a simple transaction to send values"
      contentFn={Content()}
    />
  );
}

function Content() {
  const codeSnippet = `await mesh
  .txIn(txInHash, txInId)
  .txOut(this.constants.walletAddress, [{ unit: "lovelace", quantity: amount.toString() }])
  .changeAddress(this.constants.walletAddress)
  .signingKey(this.constants.skey)
  .complete();

const signedTx = mesh.completeSigning()`;

  return (
    <>
      <p>
        The following shows a simple example of building a transaction to send
        values to a recipient:
      </p>
      <Codeblock data={codeSnippet} isJson={false} />
      <p>
        <a href="https://github.com/sidan-lab/mesh-lower-level-api-demo/blob/mesh-docs/src/transactions/demo.ts#L68C1-L78C5">
          Full Code Snippet in Github
        </a>
      </p>
    </>
  );
}
