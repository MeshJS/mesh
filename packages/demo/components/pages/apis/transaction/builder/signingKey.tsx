import Section from '../../../../common/section';
import Codeblock from '../../../../ui/codeblock';

export default function SigningKey() {
  return (
    <Section
      sidebarTo="signingKey"
      header="Sign with signing key"
      contentFn={Content()}
    />
  );
}

function Content() {
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
