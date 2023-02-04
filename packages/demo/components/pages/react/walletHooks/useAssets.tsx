import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import RunDemoResult from '../../../common/runDemoResult';
import SectionTwoCol from '../../../common/sectionTwoCol';
import { useAssets } from '@meshsdk/react';
import { CardanoWallet } from '@meshsdk/react';

export default function UseAssets() {
  return (
    <>
      <SectionTwoCol
        sidebarTo="useAssets"
        header="useAssets"
        leftFn={Left()}
        rightFn={Right()}
      />
    </>
  );
}

function Left() {
  const assets = useAssets();
  let code1 = `const assets = useAssets();`;

  return (
    <>
      <p>Return a list of assets in connected wallet from all UTXOs.</p>
      <Codeblock data={code1} isJson={false} />
      <RunDemoResult response={assets} label="assets" />
    </>
  );
}

function Right() {
  const assets = useAssets();
  let code2 = `import { useAssets } from '@meshsdk/react';\n\n`;
  code2 += `export default function Page() {\n`;
  code2 += `  const assets = useAssets();\n\n`;
  code2 += `  return (\n`;
  code2 += `    <ol>\n`;
  code2 += `      {assets &&\n`;
  code2 += `        assets.slice(0, 10).map((asset, i) => {\n`;
  code2 += `          return (\n`;
  code2 += `            <li key={i}>\n`;
  code2 += `              <b>{asset.assetName}</b> (x{asset.quantity})\n`;
  code2 += `            </li>\n`;
  code2 += `          );\n`;
  code2 += `        })}\n`;
  code2 += `    </ol>\n`;
  code2 += `  );\n`;
  code2 += `}\n`;

  return (
    <Card>
      <Codeblock data={code2} isJson={false} />
      <CardanoWallet />
      <ol>
        {assets !== undefined &&
          assets.slice(0, 10).map((asset, i) => {
            return (
              <li key={i}>
                <b>{asset.unit}</b> (x{asset.quantity})
              </li>
            );
          })}
      </ol>
    </Card>
  );
}
