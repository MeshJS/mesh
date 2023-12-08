import Section from '../../../../common/section';
import Codeblock from '../../../../ui/codeblock';

export default function LockFund() {
  return (
    <Section
      sidebarTo="lockFund"
      header="Build a transaction to send fund to smart contract"
      contentFn={Content()}
    />
  );
}

function Content() {
  const codeSnippet = `await mesh
  .txIn(txInHash, txInId)
  .txOut(validatorAddress, [])
  .txOutInlineDatumValue(1618)
  .changeAddress(this.constants.walletAddress)
  .signingKey(this.constants.skey)
  .complete();

const signedTx = mesh.completeSigning()`;

  return (
    <>
      <p>
        The following shows a simple example of building a transaction to lock
        fund in a smart contact. It is equivalent to the following CLI command
        in <a href="https://plutuspbl.io/modules/102/1024">PPBL Module 102.4</a>
        .
      </p>
      <Codeblock data={codeSnippet} isJson={false} />
      <p>
        <a href="https://github.com/sidan-lab/mesh-lower-level-api-demo/blob/mesh-docs/src/transactions/demo.ts#L80C1-L91C5">
          Full Code Snippet in Github
        </a>
      </p>
    </>
  );
}
