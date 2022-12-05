import { useState, useEffect } from 'react';
import Codeblock from '../../../ui/codeblock';
import { Element } from 'react-scroll';
import Fetcher from './fetcher';
import { BlockfrostProvider } from '@meshsdk/core';
import { BadgeFetcher, BadgeSubmitter } from './badges';
import Submitter from './submitter';

export default function Blockfrost() {
  const [blockfrostProvider, setBlockfrostProvider] =
    useState<BlockfrostProvider | null>(null);

  useEffect(() => {
    async function load() {
      const _blockfrostProvider = new BlockfrostProvider(
        process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_PREPROD!
      );
      setBlockfrostProvider(_blockfrostProvider);
    }
    load();
  }, []);

  let code1 = `const blockfrostProvider = new BlockfrostProvider('<BLOCKFROST_API_KEY>');\n`;

  return (
    <>
      <h2>
        Blockfrost
        <span className="ml-2">
          <BadgeFetcher />
          <BadgeSubmitter />
        </span>
      </h2>

      <div className="grid grid-cols-1 px-4 lg:grid-cols-2 lg:gap-16 pb-16">
        <div className="col-span-1 xl:col-auto">
          <p>
            <a href="https://blockfrost.io/" target="_blank" rel="noreferrer">
              Blockfrost
            </a>{' '}
            provides restful APIs which allows your app to access information
            stored on the blockchain.
          </p>
          <Codeblock data={code1} isJson={false} />
        </div>
        <div className="col-span-1"></div>
      </div>

      <Fetcher fetcher={blockfrostProvider} fetcherName="blockfrostProvider" />
      <Submitter
        submitter={blockfrostProvider}
        submitterName="blockfrostProvider"
      />
    </>
  );
}
