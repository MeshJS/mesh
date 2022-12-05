import { useState, useEffect } from 'react';
import Codeblock from '../../../ui/codeblock';
import { Element } from 'react-scroll';
import Fetcher from './fetcher';
import { KoiosProvider } from 'meshjs';
import { BadgeFetcher, BadgeSubmitter } from './badges';
import Submitter from './submitter';

export default function Koios() {
  const [koiosProvider, setKoiosProvider] = useState<KoiosProvider | null>(
    null
  );

  useEffect(() => {
    async function load() {
      const _koiosProvider = new KoiosProvider('preview');
      setKoiosProvider(_koiosProvider);
    }
    load();
  }, []);

  let code1 = `const koiosProvider = new KoiosProvider('<api,preview,preprod,guild>');\n`;

  return (
    <>
      <Element name="koios">
        <h2>
          Koios
          <span className="ml-2">
            <BadgeFetcher />
            <BadgeSubmitter />
          </span>
        </h2>

        <div className="grid grid-cols-1 px-4 lg:grid-cols-2 lg:gap-16 pb-16">
          <div className="col-span-1 xl:col-auto">
            <p>
              <a
                href="https://www.koios.rest/"
                target="_blank"
                rel="noreferrer"
              >
                Koios
              </a>{' '}
              provides a query layer which allows your app to access information
              stored on the blockchain.
            </p>
            <Codeblock data={code1} isJson={false} />
          </div>
          <div className="col-span-1"></div>
        </div>
      </Element>

      <Fetcher fetcher={koiosProvider} fetcherName="koiosProvider" />
      <Submitter submitter={koiosProvider} submitterName="koiosProvider" />
    </>
  );
}
