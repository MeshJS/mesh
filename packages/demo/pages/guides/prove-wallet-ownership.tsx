import type { NextPage } from 'next';
import GuidesLayout from '../../components/pages/guides/layout';
import Codeblock from '../../components/ui/codeblock';
import { Element } from 'react-scroll';
import Metatags from '../../components/site/metatags';
import { checkSignature, generateNonce } from '@meshsdk/core';
import { CardanoWallet, useWallet } from '@meshsdk/react';
import { useState } from 'react';
import RunDemoResult from '../../components/common/runDemoResult';

const GuideLoginWithWalletPage: NextPage = () => {
  const { wallet, connected } = useWallet();
  const [state, setState] = useState<number>(0);
  const [response, setResponse] = useState<null | any>(null);

  const sidebarItems = [
    { label: 'How does it work?', to: 'howwork' },
    { label: 'Client: Connect wallet and get staking address', to: 'step1' },
    { label: 'Server: Generate nonce and store in database', to: 'step2' },
    { label: 'Client: Verify ownership by signing the nonce', to: 'step3' },
    { label: 'Server: Verify signature', to: 'step4' },
    { label: 'Put them all together', to: 'step5' },
  ];

  async function frontendStep1() {
    if (connected) {
      setState(1);
      const userAddress = (await wallet.getRewardAddresses())[0];
      await backendStep1(userAddress);
    }
  }

  async function backendStep1(userAddress) {
    const nonce = generateNonce('Sign to login in to Mesh: ');
    await frontendStep2(userAddress, nonce);
  }

  async function frontendStep2(userAddress, nonce) {
    try {
      const signature = await wallet.signData(userAddress, nonce);
      await backendStep2(userAddress, nonce, signature);
    } catch (error) {
      setState(0);
    }
  }

  async function backendStep2(userAddress, nonce, signature) {
    const result = checkSignature(nonce, userAddress, signature);
    setResponse(result);
    setState(0);
  }

  let codeSnippet1 = `const { wallet, connected } = useWallet();\n\n`;
  codeSnippet1 += `async function frontendStartLoginProcess() {\n`;
  codeSnippet1 += `  if (connected) {\n`;
  codeSnippet1 += `    const userAddress = (await wallet.getRewardAddresses())[0];\n\n `;
  codeSnippet1 += `    // do: send request with 'userAddress' to the backend\n`;
  codeSnippet1 += `  }\n`;
  codeSnippet1 += `}\n`;

  let codeSnippet2 = `import { generateNonce } from '@meshsdk/core';\n\n`;
  codeSnippet2 += `async function backendGetNonce(userAddress) {\n`;
  codeSnippet2 += `  // do: if new user, create new user model in the database\n\n`;
  codeSnippet2 += `  const nonce = generateNonce('Sign to login in to Mesh: ');\n\n`;
  codeSnippet2 += `  // do: store 'nonce' in user model in the database\n\n`;
  codeSnippet2 += `  // do: return 'nonce'\n`;
  codeSnippet2 += `}\n`;

  let codeSnippet3 = ``;
  codeSnippet3 += `async function frontendSignMessage(nonce) {\n`;
  codeSnippet3 += `  try {\n`;
  codeSnippet3 += `    const userAddress = (await wallet.getRewardAddresses())[0];\n`;
  codeSnippet3 += `    const signature = await wallet.signData(userAddress, nonce);\n\n`;
  codeSnippet3 += `    // do: send request with 'signature' and 'userAddress' to the backend\n`;
  codeSnippet3 += `  } catch (error) {\n`;
  codeSnippet3 += `    // catch error if user refuse to sign\n`;
  codeSnippet3 += `  }\n`;
  codeSnippet3 += `}\n`;

  let codeSnippet4 = `import { checkSignature } from '@meshsdk/core';\n\n`;
  codeSnippet4 += `async function backendVerifySignature(userAddress, signature) {\n`;
  codeSnippet4 += `  // do: get 'nonce' from user (database) using 'userAddress'\n\n`;
  codeSnippet4 += `  const result = checkSignature(nonce, userAddress, signature);\n\n`;
  codeSnippet4 += `  // do: update 'nonce' in the database with another random string\n\n`;
  codeSnippet4 += `  // do: do what you need after user proof ownership\n`;
  codeSnippet4 += `  // it could be creating a valid JSON Web Token (JWT) or session\n`;
  codeSnippet4 += `  // it could be doing something offchain\n`;
  codeSnippet4 += `  // it could just be updating something in the database\n`;
  codeSnippet4 += `}\n`;

  let codeSnippetClient = `import { CardanoWallet, useWallet } from '@meshsdk/react';\n\n`;
  codeSnippetClient += `export default function Page() {\n`;
  codeSnippetClient += `  const { wallet, connected } = useWallet();\n`;
  codeSnippetClient += `  \n`;
  codeSnippetClient += `  async function frontendStartLoginProcess() {\n`;
  codeSnippetClient += `    if (connected) {\n`;
  codeSnippetClient += `      const userAddress = (await wallet.getRewardAddresses())[0];\n`;
  codeSnippetClient += `      const nonce = await backendGetNonce(userAddress);\n`;
  codeSnippetClient += `      await signMessage(nonce);\n`;
  codeSnippetClient += `    }\n`;
  codeSnippetClient += `  }\n`;
  codeSnippetClient += `  \n`;
  codeSnippetClient += `  async function frontendSignMessage(nonce) {\n`;
  codeSnippetClient += `    try {\n`;
  codeSnippetClient += `      const userAddress = (await wallet.getRewardAddresses())[0];\n`;
  codeSnippetClient += `      const signature = await wallet.signData(userAddress, nonce);\n`;
  codeSnippetClient += `      await backendVerifySignature(userAddress, signature);\n`;
  codeSnippetClient += `    } catch (error) {\n`;
  codeSnippetClient += `      setState(0);\n`;
  codeSnippetClient += `    }\n`;
  codeSnippetClient += `  }\n\n`;
  codeSnippetClient += `  return (\n`;
  codeSnippetClient += `    <>\n`;
  codeSnippetClient += `      <CardanoWallet\n`;
  codeSnippetClient += `        label="Sign In with Cardano"\n`;
  codeSnippetClient += `        onConnected={() => frontendStartLoginProcess()}\n`;
  codeSnippetClient += `      />\n`;
  codeSnippetClient += `    </>\n`;
  codeSnippetClient += `  );\n`;
  codeSnippetClient += `}\n`;

  let codeSnippetServer = ``;
  codeSnippetServer += `import { checkSignature, generateNonce } from '@meshsdk/core';\n`;
  codeSnippetServer += `\n`;
  codeSnippetServer += `async function backendGetNonce(userAddress) {\n`;
  codeSnippetServer += `  const nonce = generateNonce('Sign to login in to Mesh: ');\n`;
  codeSnippetServer += `  return nonce;\n`;
  codeSnippetServer += `}\n`;
  codeSnippetServer += `\n`;
  codeSnippetServer += `async function backendVerifySignature(userAddress, signature) {\n`;
  codeSnippetServer += `  // do: get 'nonce' from database\n\n`;
  codeSnippetServer += `  const result = checkSignature(nonce, userAddress, signature);\n`;
  codeSnippetServer += `  if(result){\n`;
  codeSnippetServer += `    // create JWT or approve certain process\n`;
  codeSnippetServer += `  }\n`;
  codeSnippetServer += `  else{\n`;
  codeSnippetServer += `    // prompt user that signature is not correct\n`;
  codeSnippetServer += `  }\n`;
  codeSnippetServer += `}\n`;

  let codeSnippetWallet = ``;
  codeSnippetWallet += `<CardanoWallet\n`;
  codeSnippetWallet += `  label="Sign In with Cardano"\n`;
  codeSnippetWallet += `  onConnected={() => frontendStartLoginProcess()}\n`;
  codeSnippetWallet += `/>\n`;

  return (
    <>
      <Metatags
        title="Cryptographically Prove Wallet Ownership"
        description="Cryptographically prove the ownership of a wallet by
        signing a piece of data using data sign."
        image="/guides/cryptographically-prove-wallet-ownership.png"
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
          provider. A server (service provider) could generate a token and
          provide that to a client (identity provider). The client could then
          use that token to prove the ownership of the wallet, these tokens can
          be signed by one party's private key.
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
          <li>
            <b>Off chain account flow</b>. If you need to display certain data
            that is off-chain or on a website only to a particular user
            identified by their wallet, you could use a message as a means of
            doing so.
          </li>
        </ul>

        <Element name="demo">
          <h2>Demo</h2>
          <p>Try the demo. Sign in with your Cardano wallet.</p>
          <CardanoWallet
            label="Sign In with Cardano"
            onConnected={() => frontendStep1()}
          />
          <RunDemoResult response={response} label="Signature is valid" />
          <p>
            You will get <code>true</code> if the nonce has been signed by the
            user's wallet.
          </p>
        </Element>

        <Element name="howwork">
          <h2>How does It Work?</h2>

          <img
            src="/guides/cryptographically-prove-wallet-ownership-process.png"
            width="100%"
          />

          <p>
            By signing a message, you are affirming that you are in control of
            the wallet address linked to the Blockchain, and thus can prove
            ownership of it.
          </p>

          <p>There are 4 ingredients to signing a message:</p>

          <ul>
            <li>user wallet address</li>
            <li>private key</li>
            <li>public key</li>
            <li>message to sign</li>
          </ul>

          <p>
            To check if a user owns a certain address on a Web3 site, one needs
            to provide a message and have the user "sign" it. This "signature"
            is generated using the message, the user's private key, the public
            key, and a cryptographic algorithm.
          </p>

          <p>
            To ensure the signature is valid, the same cryptographic algorithm
            is applied to the message and the public key is obtained. You may be
            wondering how this is secure, and the answer is that without the
            private key, the validation of the message and the public key cannot
            be cryptographically matched, thereby confirming ownership.
          </p>
        </Element>

        <Element name="step1">
          <h2>Client: Connect Wallet and Get Staking Address</h2>
          <p>
            The User model stored in the database of the backend server must
            have two compulsory fields: public address and nonce. Furthermore,
            this address has to be unique. Other details about the user, such as
            username, Twitter ID, and name fields, are not essential for this
            process, but can be added.
          </p>
          <p>
            User's public address as an identifier, in Cardano, we can use their
            wallet's staking address. This will be stored in the server side
            database, so that authorized wallets can be linked. The user never
            has to worry about manually entering their address, since it can be
            retrieved using <code>wallet.getRewardAddresses()</code>.
          </p>

          <p>
            With the user's wallet connected, get the user's staking address and
            send it to our backend server.
          </p>

          <Codeblock data={codeSnippet1} isJson={false} />
        </Element>

        <Element name="step2">
          <h2>Server: Generate Nonce and Store in Database</h2>

          <p>
            We first need to generate a new nonce, which is initialized as a
            random string. The purpose of this is to create a unique message
            that can be used for authentication of the user's wallet. This nonce
            will be the payload for the user to proof wallet's ownership. With
            Mesh, you can generate a new nonce with <code>generateNonce()</code>
            , and set the message as{' '}
            <code>Sign to login in to Mesh: nonce</code>.
          </p>
          <p>
            By utilizing the <code>userAddress</code>, we can look up the
            database to determine whether the user is new or existing.
          </p>
          <p>
            If the user is new, we can create a new user entry, storing their
            staking address, nonce, and set their status as "not verified". Once
            the user has successfully verified, we can update their status to
            "verified" in our database.
          </p>
          <p>
            For existing users, we just have to store the newly generated nonce
            into the database.
          </p>

          <Codeblock data={codeSnippet2} isJson={false} />

          <p>
            Lastly, we will return the <code>nonce</code> for the user to sign
            using their private key.
          </p>
        </Element>

        <Element name="step3">
          <h2>Client: Verify ownership by signing the nonce</h2>
          <p>
            We are ready to use the private key associated with the wallet to
            sign the nonce with{' '}
            <code>await wallet.signData(userAddress, nonce)</code>, which
            enables the dApp to request the user to sign a payload according to{' '}
            <a
              href="https://cips.cardano.org/cips/cip8/"
              target="_blank"
              rel="noreferrer"
            >
              CIP-8
            </a>
            .
          </p>
          <p>
            We request the user's authorization and show them the message that
            is to be signed: <code>Sign to login in to Mesh: nonce</code>. Once
            accepted, the signature will be generated and the dApp will process
            the signature to authenticate the user.
          </p>

          <Codeblock data={codeSnippet3} isJson={false} />
        </Element>

        <Element name="step4">
          <h2>Server: Verify Signature</h2>

          <p>
            When the backend receives the request, it retrieves the users from
            the database that are related to the address specified in the
            request. It then obtains the associated nonce from the database,
            which is a random value that is only known to the user.
          </p>
          <p>
            With the nonce, staking address, and signature, the backend can
            cryptographically check that the nonce has been correctly signed by
            the user. This allows the backend to verify that the user is the
            owner of the public address, as only the owner of the address would
            know the nonce value and be able to sign it with the associated
            private key.
          </p>
          <p>
            If the signature is verified, the user has successfully
            authenticated and the front end will then receive a JSON Web Token
            (JWT) or session identifier to allow the user to access further
            resources. This is an example is for login process, but you can
            change it to approving a specific action.
          </p>
          <p>
            We also ensure that the nonce is not reused, as this would make it
            possible for an attacker to gain access to the user's account. This
            is done by generating a random nonce for the user and saving it to
            the database. By constantly generating a unique nonce each time the
            user logs in, we can guarantee the user's signature is secure and
            that their account is safe.
          </p>
          <Codeblock data={codeSnippet4} isJson={false} />
        </Element>

        <Element name="step5">
          <h2>Put Them All Together</h2>
          <p>
            Lets put them all together. Your frontend code should contain two
            functions <code>frontendStartLoginProcess()</code> and{' '}
            <code>frontendSignMessage(nonce)</code>.
          </p>
          <p>
            For sign in with wallet, you can use the <code>CardanoWallet</code>{' '}
            React UI component to connect and sign in with wallet:
          </p>
          <Codeblock data={codeSnippetWallet} isJson={false} language='language-html' />
          <p>Putting the frontend codes together might looks like this:</p>
          <Codeblock data={codeSnippetClient} isJson={false} />
          <p>
            And the server side code should have 2 REST endpoints,{' '}
            <code>backendGetNonce(userAddress)</code> and{' '}
            <code>backendVerifySignature(userAddress, signature)</code>, the
            code might look like this:
          </p>
          <Codeblock data={codeSnippetServer} isJson={false} />
          <p>
            There you go! Although this guide shows you how you can sign in with
            wallet, you can use this technique to authenticate any user's
            actions.
          </p>
        </Element>
      </GuidesLayout>
    </>
  );
};

export default GuideLoginWithWalletPage;
