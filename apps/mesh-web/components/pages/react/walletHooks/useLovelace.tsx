import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import RunDemoResult from '../../../common/runDemoResult';
import SectionTwoCol from '../../../common/sectionTwoCol';
import { useLovelace } from '@meshsdk/react';
import { CardanoWallet } from '@meshsdk/react';

export default function UseLovelace() {
  return (
    <SectionTwoCol
      sidebarTo="useLovelace"
      header="useLovelace"
      leftFn={Left()}
      rightFn={Right()}
    />
  );
}

function Left() {
  const lovelace = useLovelace();
  let code1 = `const lovelace = useLovelace(accountId = 0);`;

  return (
    <>
      <p>Return amount of lovelace in wallet.</p>
      <Codeblock data={code1} isJson={false} />
      {lovelace && <RunDemoResult response={lovelace} label="lovelace" />}
    </>
  );
}

function Right() {
  const lovelace = useLovelace();
  let code2 = `import { useLovelace } from '@meshsdk/react';\n\n`;
  code2 += `export default function Page() {\n`;
  code2 += `  const lovelace = useLovelace();\n\n`;
  code2 += `  return (\n`;
  code2 += `    <div>\n`;
  code2 += `      <p>You have <b>₳ {parseInt(lovelace) / 1000000}</b>.</p>\n`;
  code2 += `    </div>\n`;
  code2 += `  );\n`;
  code2 += `}\n`;

  return (
    <Card>
      <Codeblock data={code2} isJson={false} />
      <CardanoWallet />
      {lovelace !== undefined && (
        <>
          <div>
            <p>
              You have <b>₳ {parseInt(lovelace) / 1000000}</b>.
            </p>
          </div>
        </>
      )}
    </Card>
  );
}
