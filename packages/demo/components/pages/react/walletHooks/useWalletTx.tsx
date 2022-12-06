import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import RunDemoResult from '../../../common/runDemoResult';
import SectionTwoCol from '../../../common/sectionTwoCol';
import { useWalletTx } from '@meshsdk/react';
import { CardanoWallet } from '@meshsdk/react';

export default function UseWalletTx() {
  return (
    <SectionTwoCol
      sidebarTo="useWalletTx"
      header="useWalletTx"
      leftFn={Left()}
      rightFn={Right()}
    />
  );
}

function Left() {
  // const lovelace = useWalletTx({});
  let code1 = `const lovelace = useWalletTx(accountId = 0);`;

  return (
    <>
      <p>Return amount of lovelace in wallet.</p>
      <Codeblock data={code1} isJson={false} />
      {/* {lovelace && <RunDemoResult response={lovelace} label="lovelace" />} */}
    </>
  );
}

function Right() {
  // const lovelace = useWalletTx({});
  let code2 = `import { useWalletTx } from '@meshsdk/react';\n\n`;
  code2 += `export default function Page() {\n`;
  code2 += `  const lovelace = useWalletTx();\n\n`;
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
      {/* {lovelace !== undefined && (
        <>
          <div>
            <p>
              
            </p>
          </div>
        </>
      )} */}
    </Card>
  );
}
