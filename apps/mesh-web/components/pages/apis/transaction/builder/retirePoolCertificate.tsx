import Section from '../../../../common/section';
import Codeblock from '../../../../ui/codeblock';

export default function RetirePoolCertificate() {
  return (
    <Section
      sidebarTo="retirePoolCertificate"
      header="Retire Pool Certificate"
      contentFn={Content()}
    />
  );
}

function Content() {
  let code = `mesh
  .retirePoolCertificate(poolId: string, epoch: number)`;

  return (
    <>
      <p>
        Use <code>.retirePoolCertificate()</code> to retire a pool certificate:
      </p>

      <Codeblock data={code} isJson={false} />
    </>
  );
}
