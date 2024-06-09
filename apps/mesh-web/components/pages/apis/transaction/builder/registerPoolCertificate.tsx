import Section from '../../../../common/section';
import Codeblock from '../../../../ui/codeblock';

export default function RegisterPoolCertificate() {
  return (
    <Section
      sidebarTo="registerPoolCertificate"
      header="Register Pool Certificate"
      contentFn={Content()}
    />
  );
}

function Content() {
  let code = `mesh
  .registerPoolCertificate(poolParams: PoolParams)`;

  return (
    <>
      <p>
        Use <code>.registerPoolCertificate()</code> to register a pool
        certificate:
      </p>

      <Codeblock data={code} isJson={false} />
    </>
  );
}
