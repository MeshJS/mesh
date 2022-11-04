import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import SectionTwoCol from '../../../common/sectionTwoCol';
import { SelectWallet } from '@martifylabs/mesh-react';

export default function UiConnectWallet() {
  return (
    <>
      <SectionTwoCol
        sidebarTo="connectWallet"
        header="Connect Wallet"
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
        A dropdown component which allows the user to select a wallet to
        connect.
      </p>
    </>
  );
}

function Right() {
  let code2 = `import { ConnectWallet } from '@martifylabs/mesh-react';\n\n`;
  code2 += `export default function Page() {\n`;
  code2 += `  return (\n`;
  code2 += `    <>\n`;
  code2 += `      <SelectWallet />\n`;
  code2 += `    </>\n`;
  code2 += `  );\n`;
  code2 += `}\n`;

  return (
    <Card>
      <Codeblock data={code2} isJson={false} />
      <SelectWallet />
    </Card>
  );
}
