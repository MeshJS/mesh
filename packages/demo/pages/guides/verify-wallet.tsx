import type { NextPage } from 'next';
import Link from 'next/link';
import GuidesLayout from '../../components/pages/guides/layout';
import Codeblock from '../../components/ui/codeblock';
import { Element } from 'react-scroll';
import Metatags from '../../components/site/metatags';

import { checkSignature, generateNonce } from '@meshsdk/core';
import RunDemoButton from '../../components/common/runDemoButton';

import { CardanoWallet, useWallet } from '@meshsdk/react';

const GuideLoginWithWalletPage: NextPage = () => {
  const { wallet, connected, name, connecting, connect, disconnect, error } =
    useWallet();

  const sidebarItems = [{ label: 'System setup', to: 'systemsetup' }];

  async function frontendStep1() {
    if (connected) {
      const signerAddress = (await wallet.getRewardAddresses())[0];
      console.log('signerAddress', signerAddress);

      const nonce = generateNonce('Hello World!');
      console.log('nonce', nonce);

      const signature = await wallet.signData(signerAddress, nonce);
      console.log('signature', signature);

      const result = checkSignature(nonce, signerAddress, signature);
      console.log('result', result);
    }
  }

  async function backendStep1(signerAddress) {
    const nonce = 'await generateNonce()';
    console.log(112, nonce);
  }

  async function frontendStep2(nonce) {}

  async function backendStep2(nonce, signerAddress, signature) {}

  return (
    <>
      <Metatags
        title="cryptographically prove ownership"
        description="Login"
        image="/guides/develop-first-web-app.png"
      />
      <GuidesLayout
        title="Cryptographically Prove Wallet Ownership"
        desc="Cryptographically prove the ownership of a wallet by
        signing a piece of data using data sign."
        sidebarItems={sidebarItems}
        image="/guides/door-gf0710cc4d_640.jpg"
      >
        <p>
          It's cryptographically easy to prove the ownership of an account by
          signing a piece of data using a private key. Since a user's public
          address can used as their identifier, we can build an authentication
          mechanism that is based on message signing. This mechanism is made
          possible by being able to cryptographically prove the ownership of an
          account by signing a specific piece of data using the corresponding
          private key. If the data is correctly signed, then the backend will
          recognize it as the owner of the public address.
        </p>

        <p>
          JSON Web Token (JWT) claims can typically be used to pass identity of
          authenticated users between an identity provider and a service
          provider. A server (service provider) could generate a token and provide
          that to a client (identity provider). The client could then use that
          token to prove the ownership of the wallet, these tokens can be signed
          by one party's private key.
        </p>

        <p>Some usage of data sign to cryptographically prove ownership:</p>

        <ul>
          <li>
            <b>Authenticate user sign in using JSON Web Token (JWT)</b>. A
            cryptographically-secure login to prove the ownership of an account
            by signing a piece of data using a private key.
          </li>
          <li>
            <b>Authenticate user's action</b>. If the backend wants to confirm
            user's authorization on a off-chain action, for example, performing
            in-game trading.
          </li>
        </ul>

        <Element name="demo">
          <h2>Demo</h2>
          <CardanoWallet />
          <RunDemoButton
            runDemoFn={frontendStep1}
            loading={false}
            response={false}
          />
        </Element>
      </GuidesLayout>
    </>
  );
};

export default GuideLoginWithWalletPage;
