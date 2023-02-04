import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import RunDemoResult from '../../../common/runDemoResult';
import SectionTwoCol from '../../../common/sectionTwoCol';
import { useNetwork } from '@meshsdk/react';
import { CardanoWallet } from '@meshsdk/react';

export default function UseNetwork() {
  return (
    <SectionTwoCol
      sidebarTo="useNetwork"
      header="useNetwork"
      leftFn={Left()}
      rightFn={Right()}
    />
  );
}

function Left() {
  const network = useNetwork();
  let code1 = `const network = useNetwork();`;

  return (
    <>
      <p>Return the network of connected wallet.</p>
      <Codeblock data={code1} isJson={false} />
      {network !== undefined && <RunDemoResult response={network} label="network" />}
    </>
  );
}

function Right() {
  const network = useNetwork();
  let code2 = `import { useNetwork } from '@meshsdk/react';\n\n`;
  code2 += `export default function Page() {\n`;
  code2 += `  const network = useNetwork();\n\n`;
  code2 += `  return (\n`;
  code2 += `    <div>\n`;
  code2 += `      <p>Connected network: <b>{network}</b>.</p>\n`;
  code2 += `    </div>\n`;
  code2 += `  );\n`;
  code2 += `}\n`;

  return (
    <Card>
      <Codeblock data={code2} isJson={false} />
      <CardanoWallet />
      {network !== undefined && (
        <>
          <div>
            <p>
              Connected network: <b>{network}</b>.
            </p>
          </div>
        </>
      )}
    </Card>
  );
}
