import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import RunDemoResult from '../../../common/runDemoResult';
import SectionTwoCol from '../../../common/sectionTwoCol';
import { useAddress } from '@meshsdk/react';
import { CardanoWallet } from '@meshsdk/react';

export default function UseAddress() {
  return (
    <SectionTwoCol
      sidebarTo="useAddress"
      header="useAddress"
      leftFn={Left()}
      rightFn={Right()}
    />
  );
}

function Left() {
  const address = useAddress();
  let code1 = `const address = useAddress(accountId = 0);`;

  return (
    <>
      <p>Return address of connected wallet.</p>
      <p>
        <code>accountId</code> is an optional parameter, that allows you to
        choose which address to return.
      </p>
      <Codeblock data={code1} isJson={false} />
      {address && <RunDemoResult response={address} label="address" />}
    </>
  );
}

function Right() {
  const address = useAddress();
  let code2 = `import { useAddress } from '@meshsdk/react';\n\n`;
  code2 += `export default function Page() {\n`;
  code2 += `  const address = useAddress();\n\n`;
  code2 += `  return (\n`;
  code2 += `    <div><p>Your wallet address is: <code>{address}</code></p></div>\n`;
  code2 += `  );\n`;
  code2 += `}\n`;

  return (
    <Card>
      <Codeblock data={code2} isJson={false} />
      <CardanoWallet />
      {address !== undefined && (
        <>
          <div>
            <p>
              Your wallet address is: <code>{address}</code>
            </p>
          </div>
        </>
      )}
    </Card>
  );
}
