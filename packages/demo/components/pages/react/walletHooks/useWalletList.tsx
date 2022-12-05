import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import RunDemoResult from '../../../common/runDemoResult';
import SectionTwoCol from '../../../common/sectionTwoCol';
import { useWalletList } from '@meshsdk/react';

export default function UseWalletList() {
  return (
    <SectionTwoCol
      sidebarTo="useWalletList"
      header="useWalletList"
      leftFn={Left()}
      rightFn={Right()}
    />
  );
}

function Left() {
  const wallets = useWalletList();
  let code1 = `const wallets = useWalletList();`;
  return (
    <>
      <p>Returns a list of wallets installed on user's device.</p>
      <Codeblock data={code1} isJson={false} />
      <RunDemoResult response={wallets} label="wallets" />
    </>
  );
}

function Right() {
  const wallets = useWalletList();
  let code2 = `import { useWalletList } from '@meshsdk/react';\n\n`;
  code2 += `export default function Page() {\n`;
  code2 += `  const wallets = useWalletList();\n\n`;
  code2 += `  return (\n`;
  code2 += `    <>\n`;
  code2 += `      {wallets.map((wallet, i) => {\n`;
  code2 += `        return (\n`;
  code2 += `          <p key={i}>\n`;
  code2 += `            <img src={wallet.icon} style={{ width: '48px' }} />\n`;
  code2 += `            <b>{wallet.name}</b>\n`;
  code2 += `          </p>\n`;
  code2 += `        );\n`;
  code2 += `      })}\n`;
  code2 += `    </>\n`;
  code2 += `  );\n`;
  code2 += `}\n`;
  return (
    <Card>
      <Codeblock data={code2} isJson={false} />
      {wallets.map((wallet, i) => {
        return (
          <p key={i}>
            <img src={wallet.icon} style={{ width: '48px' }} />
            <b>{wallet.name}</b>
          </p>
        );
      })}
    </Card>
  );
}
