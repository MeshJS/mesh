import type { NextPage } from 'next';
import Metatags from '../../components/site/metatags';
import { useEffect } from 'react';
import Router from 'next/router';

const GuideMultisigMintingPageRedirect: NextPage = () => {
  useEffect(() => {
    const { pathname } = Router;
    if (pathname == '/guides/multisigminting') {
      Router.push('/guides/multisig-minting');
    }
  });
  return (
    <>
      <Metatags
        title="Multi-signature Minting"
        description="Create a multi-sig transaction and mint NFTs"
      />
    </>
  );
};
export default GuideMultisigMintingPageRedirect;
