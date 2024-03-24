import Section from '../../../../common/section';
import Codeblock from '../../../../ui/codeblock';

export default function Staking() {
  return (
    <Section
      sidebarTo="staking"
      header="Build a transaction to (register stake certificate and) delegate stake to a pool"
      contentFn={Content()}
    />
  );
}

function Content() {
  const codeSnippet = `const usedAddress = await wallet.getUnusedAddresses();
const { stakeCredential } = serializeBech32Address(usedAddress[0]);
await mesh
  .txIn(txInHash, txInId)
  .registerStakeCertificate(stakeCredential) // Skip this line if you are not staking for the first time
  .delegateStakeCertificate(
    stakeCredential,
    'poolxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
  )
  .changeAddress(changeAddress)
  .complete();

const signedTx = mesh.completeSigning()`;

  return (
    <>
      <p>
        The following shows a simple example of building a transaction to
        (register stake certificate and) delegate stake to a pool for the first
        time.
      </p>
      <Codeblock data={codeSnippet} isJson={false} />
    </>
  );
}
