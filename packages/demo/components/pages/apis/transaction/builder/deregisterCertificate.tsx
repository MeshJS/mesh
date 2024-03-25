import Section from '../../../../common/section';
import Codeblock from '../../../../ui/codeblock';

export default function DeregisterCertificate() {
  return (
    <Section
      sidebarTo="deregisterCertificate"
      header="Deregister Stake Certificate"
      contentFn={Content()}
    />
  );
}

function Content() {
  let code = `mesh
  .deregisterStakeCertificate(stakeKeyHash: string)`;

  return (
    <>
      <p>
        Use <code>.deregisterStakeCertificate()</code> to deregister a stake
        certificate:
      </p>

      <Codeblock data={code} isJson={false} />
    </>
  );
}
