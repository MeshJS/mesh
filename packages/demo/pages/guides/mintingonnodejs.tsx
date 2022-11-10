import type { NextPage } from 'next';
import Metatags from '../../components/site/metatags';
import { useEffect } from 'react';
import Router from 'next/router';

const GuideMintingNodejsPageRedirect: NextPage = () => {
  useEffect(() => {
    const { pathname } = Router;
    if (pathname == '/guides/mintingonnodejs') {
      Router.push('/guides/minting-on-nodejs');
    }
  });
  return (
    <>
      <Metatags
        title="Minting on Node.js"
        description="Load a CLI generated key and mint assets on Node.js"
      />
    </>
  );
};
export default GuideMintingNodejsPageRedirect;
