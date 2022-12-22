import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import SectionTwoCol from '../../../common/sectionTwoCol';
import { CardanoWallet } from '@meshsdk/react';
import Link from 'next/link';
import AssetViewer from './componentAssetViewer';

export default function UiAssetViewer() {
  return (
    <>
      <SectionTwoCol
        sidebarTo="assetViewer"
        header="Asset Viewer"
        leftFn={Left()}
        rightFn={Right()}
      />
    </>
  );
}

function Left() {
  return (
    <>
      <p></p>
    </>
  );
}

function Right() {
  let code2 = `import { AssetViewer } from '@meshsdk/react';\n\n`;

  return (
    <Card>
      <Codeblock data={code2} isJson={false} />

      <AssetViewer
        metadata={{
          name: 'Mesh Token',
          image: 'ipfs://QmRzicpReutwCkM6aotuKjErFCUD213DpwPq6ByuzMJaua',
          mediaType: 'image/jpg',
          description: 'This NFT is minted by Mesh (https://meshjs.dev/).',
        }}
      />

      <AssetViewer
        metadata={{
          hat: 'Waccas Hat Red',
          unt: 'Koala',
          name: 'Cheeky Unt #0093',
          files: [
            {
              src: 'ipfs://QmUYLdXnXpSMgENtxNbZbAnczZgfzooDF46TVoPZxHuZZ8',
              name: 'CheekyUnt93',
              mediaType: 'image/gif',
            },
          ],
          image: 'ipfs://QmUYLdXnXpSMgENtxNbZbAnczZgfzooDF46TVoPZxHuZZ8',
          lefty: 'KFC Bucket',
          season: 'Road Trip',
          location: 'Aboriginal Flag',
          mediaType: 'image/gif',
        }}
      />

      <AssetViewer
        metadata={{
          name: 'PixelHead #029',
          files: [
            {
              src: 'ipfs://QmW6wgFnBEgMjSuHUmjodJTLyX9MQuADhK21GkEqzRVDDD',
              mediaType: 'text/html',
            },
          ],
          image: 'ipfs://QmdnPAgtAKVSxq2F39hfTnpPJQJ2dEpnkxPZSapaESGaW1',
          States: 3,
          project: 'The Pixel Head Squad',
          Narrative: [
            "Being a Hierarch among the Laikans, this individual's brain",
            'commands a mastery over an incredible amount of knowledge and',
            'is able to perfectly recall distant memories. However, in',
            'order to maintain his ability, he is bound to sleep away half',
            'his day.',
          ],
          mediaType: 'image/gif',
          'Creature Name': 'Drifting',
        }}
      />
    </Card>
  );
}
