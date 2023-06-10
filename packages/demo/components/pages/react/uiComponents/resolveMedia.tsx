import Codeblock from '../../../ui/codeblock';
// import Card from '../../../ui/card';
import SectionTwoCol from '../../../common/sectionTwoCol';
// import { resolveMedia } from '@meshsdk/react';

export default function UiResolveMedia() {
  return (
    <>
      <SectionTwoCol
        sidebarTo="resolveMedia"
        header="Resolve Media"
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
        This is a helper function that can be used to resolve media from IPFS.
        By default it uses the Infura IPFS, but you can pass in a different
        gateway URL as the second parameter.
      </p>

      <Codeblock
        data={`import { resolveMedia } from '@meshsdk/react';`}
        isJson={false}
      />

      {/* <Card>
        <p>Get IPFS URL with Infura:</p>
        <Codeblock
          data={`<img\n  src={resolveMedia(\n    'ipfs://QmRzicpReutwCkM6aotuKjErFCUD213DpwPq6ByuzMJaua',\n  )}\n/>`}
          isJson={false}
        />
        <img
          src={resolveMedia(
            'ipfs://QmRzicpReutwCkM6aotuKjErFCUD213DpwPq6ByuzMJaua'
          )}
          className="w-48"
        />
      </Card>

      <Card>
        <p>Get IPFS URL with Pinata:</p>
        <Codeblock
          data={`<img\n  src={resolveMedia(\n    'ipfs://QmRzicpReutwCkM6aotuKjErFCUD213DpwPq6ByuzMJaua',\n    'https://gateway.pinata.cloud/ipfs/'\n  )}\n/>`}
          isJson={false}
        />
        <img
          src={resolveMedia(
            'ipfs://QmdnPAgtAKVSxq2F39hfTnpPJQJ2dEpnkxPZSapaESGaW1',
            'https://gateway.pinata.cloud/ipfs/'
          )}
          className="w-48"
        />
      </Card>

      <Card>
        <p>
          Get IPFS URL of HTML file (and intentionally omitting{' '}
          <code>ipfs://</code>):
        </p>
        <Codeblock
          data={`<iframe\n  src={resolveMedia('QmbL9tkVZE8fND3oupLW2ctRgK2C4xHqzcWvEN8MW4k9Ge')}\n></iframe>`}
          isJson={false}
        />
        <iframe
          src={resolveMedia('QmbL9tkVZE8fND3oupLW2ctRgK2C4xHqzcWvEN8MW4k9Ge')}
          className="w-96 h-96"
        ></iframe>
      </Card> */}
    </>
  );
}

function Right() {
  return <></>;
}
