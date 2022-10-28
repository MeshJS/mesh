import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import SectionTwoCol from '../../../common/sectionTwoCol';
import { PoweredByMesh } from '@martifylabs/mesh-react';

export default function UiPoweredByMesh() {
  return (
    <>
      <SectionTwoCol
        sidebarTo="poweredByMesh"
        header="Powered by Mesh"
        leftFn={Left()}
        rightFn={Right()}
      />
    </>
  );
}

function Left() {
  return (
    <>
      <p>
        If you love Mesh, here's a little logo for you to embed on your
        application.
      </p>
    </>
  );
}

function Right() {
  let code2 = `import { PoweredByMesh } from '@martifylabs/mesh-react';\n\n`;
  code2 += `export default function Page() {\n`;
  code2 += `  return (\n`;
  code2 += `    <>\n`;
  code2 += `      <PoweredByMesh />\n`;
  code2 += `    </>\n`;
  code2 += `  );\n`;
  code2 += `}\n`;

  return (
    <Card>
      <Codeblock data={code2} isJson={false} />
      <PoweredByMesh />
    </Card>
  );
}
