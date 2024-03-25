import Section from '../../../../common/section';
import Codeblock from '../../../../ui/codeblock';

export default function RegisterCertificate() {
  return (
    <Section
      sidebarTo="registerCertificate"
      header="Register Stake Certificate"
      contentFn={Content()}
    />
  );
}

function Content() {
  let code = `mesh
  .registerStakeCertificate(stakeKeyHash: string)`;

  return (
    <>
      <p>
        Use <code>.registerStakeCertificate()</code> to register a stake
        certificate:
      </p>

      <Codeblock data={code} isJson={false} />
    </>
  );
}
