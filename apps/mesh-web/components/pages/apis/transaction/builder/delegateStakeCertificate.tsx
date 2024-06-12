import Section from '../../../../common/section';
import Codeblock from '../../../../ui/codeblock';

export default function DeregisterCertificate() {
  return (
    <Section
      sidebarTo="delegateStakeCertificate"
      header="Delegate Stake to a Pool"
      contentFn={Content()}
    />
  );
}

function Content() {
  let code = `mesh
  .delegateStakeCertificate(stakeKeyHash: string, poolId: string)`;

  return (
    <>
      <p>
        Use <code>.delegateStakeCertificate()</code> to delegate a stake to a
        pool:
      </p>

      <Codeblock data={code} isJson={false} />
    </>
  );
}
