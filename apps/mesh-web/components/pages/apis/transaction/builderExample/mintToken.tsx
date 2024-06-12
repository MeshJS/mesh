import Section from '../../../../common/section';
import Codeblock from '../../../../ui/codeblock';

export default function MintToken() {
  return (
    <Section
      sidebarTo="mintToken"
      header="Build a transaction to mint tokens"
      contentFn={Content()}
    />
  );
}

function Content() {
  const codeSnippet = `await mesh
  .txIn(txInHash, txInId)
  .mintPlutusScriptV2()
  .mint("1", policyId, tokenName)
  .mintingScript(mintingScript)
  .mintRedeemerValue(mConStr0([]))
  .txOut(this.constants.walletAddress, [{ unit: policyId + tokenName, quantity: "1" }])
  .changeAddress(this.constants.walletAddress)
  .txInCollateral(this.constants.collateralUTxO.txHash, this.constants.collateralUTxO.outputIndex)
  .signingKey(this.constants.skey)
  .complete();

const signedTx = mesh.completeSigning()`;

  return (
    <>
      <p>
        The following shows a simple example of building a transaction to mint a
        token with smart contract:
      </p>
      <Codeblock data={codeSnippet} isJson={false} />
      <p>
        <a href="https://github.com/sidan-lab/mesh-lower-level-api-demo/blob/mesh-docs/src/transactions/demo.ts#L119C1-L137C5">
          Full Code Snippet in Github
        </a>
      </p>
    </>
  );
}
