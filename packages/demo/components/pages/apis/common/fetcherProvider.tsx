import ButtonGroup from '../../../ui/buttongroup';
import Codeblock from '../../../ui/codeblock';
import useLocalStorage from '../../../../hooks/useLocalStorage';

export default function FetcherProviderCodeSnippet({ network = 0 }) {
  const [fetcherProvider, setFetcherProvider] = useLocalStorage(
    'fetcherProvider',
    'blockfrost'
  );

  let codeBF = `import { BlockfrostProvider } from '@martifylabs/mesh';\n\n`;
  codeBF += `const fetcherProvider = new BlockfrostProvider(\n`;
  codeBF += `  'BLOCKFROST_API_KEY',\n`;
  codeBF += `  ${network}\n`;
  codeBF += `);`;

  let codeKoios = `import { KoiosProvider } from '@martifylabs/mesh';\n\n`;
  codeKoios += `const fetcherProvider = new KoiosProvider(\n`;
  codeKoios += `  ${network}\n`;
  codeKoios += `);`;

  let code = codeBF;
  if (fetcherProvider == 'koios') {
    code = codeKoios;
  }

  return (
    <>
      <ButtonGroup
        items={[
          {
            key: 'blockfrost',
            label: 'Blockfrost',
            onClick: () => setFetcherProvider('blockfrost'),
          },
          {
            key: 'koios',
            label: 'Koios',
            onClick: () => setFetcherProvider('koios'),
          },
        ]}
        currentSelected={fetcherProvider}
      />
      <Codeblock data={code} isJson={false} />
    </>
  );
}
