import ButtonGroup from '../ui/buttongroup';
import Codeblock from '../ui/codeblock';
import { useState } from 'react';

export default function BlockchainProviderCodeSnippet() {
  const [blockchainProvider, setBlockchainProvider] = useState('blockfrost');

  let codeBF = `import { BlockfrostProvider } from '@meshsdk/core';\n\n`;
  codeBF += `const blockchainProvider = new BlockfrostProvider('<BLOCKFROST_API_KEY>');`;

  let codeKoios = `import { KoiosProvider } from '@meshsdk/core';\n\n`;
  codeKoios += `const blockchainProvider = new KoiosProvider('<'api'|'preview'|'preprod'|'guild'>');`;

  let codeTango = `import { TangoProvider } from '@meshsdk/core';\n\n`;
  codeTango += `const blockchainProvider = new TangoProvider(\n`;
  codeTango += `  '<mainnet,testnet>',\n`;
  codeTango += `  '<TANGOCRYPTO_APP_ID>'\n`;
  codeTango += `  '<TANGOCRYPTO_API_KEY>'\n`;
  codeTango += `);`;

  let code = codeBF;
  if (blockchainProvider == 'koios') {
    code = codeKoios;
  }
  if (blockchainProvider == 'tango') {
    code = codeTango;
  }

  return (
    <>
      <ButtonGroup
        items={[
          {
            key: 'blockfrost',
            label: 'Blockfrost',
            onClick: () => setBlockchainProvider('blockfrost'),
          },
          {
            key: 'koios',
            label: 'Koios',
            onClick: () => setBlockchainProvider('koios'),
          },
          {
            key: 'tango',
            label: 'Tangocrypto',
            onClick: () => setBlockchainProvider('tango'),
          },
        ]}
        currentSelected={blockchainProvider}
      />
      <Codeblock data={code} isJson={false} />
    </>
  );
}
