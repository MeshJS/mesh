import SectionTwoCol from '../../../../common/sectionTwoCol';
import Codeblock from '../../../../ui/codeblock';

export default function SigningKey() {
  return (
    <SectionTwoCol
      sidebarTo="signingKey"
      header="Sign with signing key"
      leftFn={Left()}
      rightFn={Right()}
    />
  );
}

function Left() {
  let code = `mesh.signingKey(skeyHex: string)`;

  return (
    <>
      <p>
        Use <code>signingKey()</code> to sign the transaction with the signing
        key:
      </p>

      <Codeblock data={code} isJson={false} />
    </>
  );
}

function Right() {
  return <></>;
}
