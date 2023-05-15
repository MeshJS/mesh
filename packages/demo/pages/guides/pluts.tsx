import type { NextPage } from 'next';
import Link from 'next/link';
import GuidesLayout from '../../components/pages/guides/layout';
import Codeblock from '../../components/ui/codeblock';
import { Element } from 'react-scroll';
import Metatags from '../../components/site/metatags';
import RunDemoButton from '../../components/common/runDemoButton';
import RunDemoResult from '../../components/common/runDemoResult';
import ConnectCipWallet from '../../components/common/connectCipWallet';

import {
  bool,
  compile,
  makeValidator,
  pBool,
  pfn,
  pstruct,
  Script,
  V2,
  PPubKeyHash,
  PScriptContext,
  bs,
} from '@harmoniclabs/plu-ts';

import {
  KoiosProvider,
  resolvePlutusScriptAddress,
  resolveDataHash,
  resolvePaymentKeyHash,
  Transaction,
  Data,
  BlockfrostProvider,
} from '@meshsdk/core';
import type { PlutusScript } from '@meshsdk/core';
import { useWallet } from '@meshsdk/react';
import { useState } from 'react';

function getAlwaysSucceedScriptCbor() {
  const Data = pstruct({
    Anything: {},
  });

  const contract = pfn(
    [Data.type, Data.type, V2.PScriptContext.type],
    bool
  )((datum, redeemer, ctx) => pBool(true));

  const untypedValidator = makeValidator(contract);
  const compiledContract = compile(untypedValidator);

  const script = new Script('PlutusScriptV2', compiledContract);

  const scriptCbor = script.cbor.toString();
  return scriptCbor;
}

function getHelloScriptCbor() {
  const contract = pfn(
    [PPubKeyHash.type, bs, PScriptContext.type],
    bool
  )((owner, message, ctx) => {
    const isBeingPolite = message.eq('Hello plu-ts');

    const signedByOwner = ctx.tx.signatories.some(owner.eqTerm);

    return isBeingPolite.and(signedByOwner);
  });

  const untypedValidator = makeValidator(contract);
  const compiledContract = compile(untypedValidator);

  const script = new Script('PlutusScriptV2', compiledContract);

  const scriptCbor = script.cbor.toString();
  return scriptCbor;
}

// function getVestingScriptCbor() {
//   const VestingDatum = pstruct({
//     VestingDatum: {
//       beneficiary: PPubKeyHash.type,
//       deadline: int,
//     },
//   });

//   // const contract = pfn(
//   //   [VestingDatum.type, data, PScriptContext.type],
//   //   bool
//   // )((datum, _redeemer, ctx) => {
//   //   // inlined
//   //   const signedByBeneficiary = ctx.tx.signatories.some(
//   //     datum.beneficiary.eqTerm
//   //   );

//   //   // inlined
//   //   const deadlineReached = pmatch(ctx.tx.interval.from.bound)
//   //     .onPFinite(({ _0: lowerInterval }) => datum.deadline.ltEq(lowerInterval))
//   //     ._((_) => pBool(false));

//   //   return signedByBeneficiary.and(deadlineReached);
//   // });

//   function pdelayedStr(str: string) {
//     return pdelay(pStr(str));
//   }

//   const contract = pfn(
//     [VestingDatum.type, data, PScriptContext.type],
//     bool
//   )((datum, _redeemer, ctx) => {
//     const signedByBeneficiary = ptraceIfFalse
//       .$(pdelayedStr('missing beneficiary'))
//       .$(ctx.tx.signatories.some(datum.beneficiary.eqTerm));

//     const deadlineReached = ptraceIfFalse.$(pdelayedStr('be patient :)')).$(
//       pmatch(ctx.tx.interval.from.bound)
//         .onPFinite(({ _0: lowerInterval }) =>
//           datum.deadline.ltEq(lowerInterval)
//         )
//         ._((_) => pBool(false))
//     );

//     return signedByBeneficiary.and(deadlineReached);
//   });

//   const untypedValidator = makeValidator(contract);
//   const compiledContract = compile(untypedValidator);

//   const script = new Script('PlutusScriptV2', compiledContract);

//   const scriptCbor = script.cbor.toString();
//   return scriptCbor;
// }

const GuidePlutsPage: NextPage = () => {
  const sidebarItems = [
    { label: 'Project Set Up', to: 'setup' },
    { label: 'Always Succeed Script', to: 'alwayssucceed' },
    { label: 'Lock ADA to Always Succeed', to: 'lock' },
    { label: 'Unlock ADA from Always Succeed', to: 'unlock' },
    { label: 'Hello plu-ts Script', to: 'helloscript' },
    { label: 'Lock ADA in Hello plu-ts', to: 'hellolock' },
    { label: 'Unlock ADA from Hello plu-ts', to: 'hellounlock' },
  ];

  return (
    <>
      <Metatags
        title="End to End Guide with plu-ts"
        description="A guide to deploying an app with a smart contract written in plu-ts in TypeScript."
        image="/guides/pluts.png"
      />
      <GuidesLayout
        title="End to End Guide with plu-ts"
        desc="A guide to deploying an app with a smart contract written in plu-ts in TypeScript."
        sidebarItems={sidebarItems}
        image="/guides/sunset-g52fe9bcd1_1280.jpg"
      >
        <IntroSection />
        <Setup />
        <AlwaysSucceed />
        <TransactionLock />
        <TransactionUnlock />
        <HelloWorldScript />
        <HelloWorldLock />
        <HelloWorldUnlock />
      </GuidesLayout>
    </>
  );
};

function IntroSection() {
  return (
    <>
      <p>
        In this guide, we will build an app that interacts with a smart
        contract written in{' '}
        <a
          href="https://pluts.harmoniclabs.tech/"
          target="_blank"
          rel="noreferrer"
        >
          plu-ts
        </a>
        . plu-ts is for building Cardano smart contracts which are entirely written,
        compiled and serialized using TypeScript. Here is an introduction to
        plu-ts on{' '}
        <a
          href="https://plutuspbl.io/modules/101/1016"
          target="_blank"
          rel="noreferrer"
        >
          Gimbalabs PPBL
        </a>
        .
      </p>

      <p>
        This guide is a continuation from the{' '}
        <a
          href="https://pluts.harmoniclabs.tech/docs/examples/Hello%20World"
          target="_blank"
          rel="noreferrer"
        >
          Hello plu-ts
        </a>{' '}
        example. You can get the entire source code for this guide on{' '}
        <a
          href="https://github.com/MeshJS/pluts-next-ts-template"
          target="_blank"
          rel="noreferrer"
        >
          GitHub
        </a>
        , and start a plu-ts project with this{' '}
        <a
          href="http://pluts-template.meshjs.dev/"
          target="_blank"
          rel="noreferrer"
        >
          starter kit
        </a>{' '}
        (or start on{' '}
        <a href="https://demeter.run/" target="_blank" rel="noreferrer">
          Demeter
        </a>
        ).
      </p>
      <p>
        At the end of this guide, you will be able to deploy an app where users
        can connect their wallets and interact with a smart contract, end-to-end
        written in TypeScript.
      </p>

      <iframe className="aspect-video w-full" src="https://www.youtube.com/embed/TdVVOqWpL4o"></iframe>

    </>
  );
}

function Setup() {
  return (
    <Element name="setup">
      <h2>Project Set Up</h2>
      <p>
        Firstly, follow the instructions on{' '}
        <Link href="/guides/nextjs">Start a Web3 app on Next.js</Link>, a
        step-by-step guide to setup a Next.js web application.
      </p>
      <p>
        Or begin the project with this starter kit with a single Mesh CLI
        command:
      </p>
      <Codeblock
        data={`npx create-mesh-app project-name -t starter -s next -l ts`}
        isJson={false}
      />

      <p>Next, install plu-ts with npm (or yarn):</p>
      <Codeblock data={`npm install @harmoniclabs/plu-ts`} isJson={false} />
    </Element>
  );
}

function AlwaysSucceed() {
  let codeImport = ``;
  codeImport += `import {\n`;
  codeImport += `  bool,\n`;
  codeImport += `  compile,\n`;
  codeImport += `  makeValidator,\n`;
  codeImport += `  pBool,\n`;
  codeImport += `  pfn,\n`;
  codeImport += `  pstruct,\n`;
  codeImport += `  Script,\n`;
  codeImport += `  V2,\n`;
  codeImport += `} from '@harmoniclabs/plu-ts';\n`;

  let code1 = ``;
  code1 += `const Data = pstruct({\n`;
  code1 += `  Anything: {},\n`;
  code1 += `});\n`;
  code1 += `\n`;
  code1 += `const contract = pfn(\n`;
  code1 += `  [Data.type, Data.type, V2.PScriptContext.type],\n`;
  code1 += `  bool\n`;
  code1 += `)((datum, redeemer, ctx) =>\n`;
  code1 += `  pBool(true) // always suceeds \n`;
  code1 += `);`;

  let code2 = ``;
  code2 += `const untypedValidator = makeValidator(contract);\n`;
  code2 += `const compiledContract = compile(untypedValidator);\n`;
  code2 += `\n`;
  code2 += `const script = new Script('PlutusScriptV2', compiledContract);`;

  let code3 = `const scriptCbor = script.cbor.toString();`;

  return (
    <Element name="alwayssucceed">
      <h2>Always Succeed Script</h2>

      <p>
        In this section, we will be locking 2 ADA from your wallet to an "always
        succeed" smart contract. In practice, multiple assets (both native assets
        and lovelace) can be sent to the contract in a single transaction.
      </p>

      <p>Let's import the necessary modules from plu-ts:</p>

      <Codeblock data={codeImport} isJson={false} />

      <p>
        Let's see how a smart contract that always succeeds is written in
        plu-ts:
      </p>

      <Codeblock data={code1} isJson={false} />

      <p>Yea, I know right? Thats pretty much it!</p>

      <p>
        Next, we will execute <code>makeValidator()</code> so that the node will
        be able to evaluate it, then <code>compile()</code> to compile the validator,
        and then wrap it in a <code>Script</code> that can be used offchain:
      </p>

      <Codeblock data={code2} isJson={false} />

      <p>Finally, we will get the compiled contract's CBOR:</p>

      <Codeblock data={code3} isJson={false} />

      <p>
        As you can see, we wrote and compiled the smart contract and serialized
        it to CBOR entirely in TypeScript. You can learn more about it on{' '}
        <a
          href="https://pluts.harmoniclabs.tech/docs/examples/Hello%20World"
          target="_blank"
          rel="noreferrer"
        >
          plu-ts documentation
        </a>
        .
      </p>
    </Element>
  );
}

function TransactionLock() {
  const [response, setResponse] = useState<null | any>(null);
  const [responseError, setResponseError] = useState<null | any>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const { wallet, connected } = useWallet();

  async function lockAsset() {
    setLoading(true);
    setResponse(null);
    setResponseError(null);

    try {
      const script: PlutusScript = {
        code: getAlwaysSucceedScriptCbor(),
        version: 'V2',
      };
      const scriptAddress = resolvePlutusScriptAddress(script, 0);

      const address = (await wallet.getUsedAddresses())[0];
      const walletKeyhash = resolvePaymentKeyHash(address);

      const tx = new Transaction({ initiator: wallet }).sendLovelace(
        {
          address: scriptAddress,
          datum: {
            value: walletKeyhash,
          },
        },
        '2000000'
      );

      const unsignedTx = await tx.build();
      const signedTx = await wallet.signTx(unsignedTx);
      const txHash = await wallet.submitTx(signedTx);

      setResponse(txHash);
    } catch (error) {
      setResponseError(`${error}`);
    }
    setLoading(false);
  }

  let code1 = ``;
  code1 += `const script: PlutusScript = {\n`;
  code1 += `  code: scriptCbor,\n`;
  code1 += `  version: 'V2',\n`;
  code1 += `};\n`;
  code1 += `const scriptAddress = resolvePlutusScriptAddress(script, 0);\n`;

  let code2 = ``;
  code2 += `const address = (await wallet.getUsedAddresses())[0];\n`;
  code2 += `const walletKeyhash = resolvePaymentKeyHash(address);\n`;

  let code3 = ``;
  code3 += `const tx = new Transaction({ initiator: wallet })\n`;
  code3 += `  .sendLovelace(\n`;
  code3 += `    {\n`;
  code3 += `      address: scriptAddress,\n`;
  code3 += `      datum: {\n`;
  code3 += `        value: walletKeyhash,\n`;
  code3 += `      },\n`;
  code3 += `    },\n`;
  code3 += `    '2000000'\n`;
  code3 += `  );\n`;
  code3 += `\n`;
  code3 += `const unsignedTx = await tx.build();\n`;
  code3 += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  code3 += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <Element name="lock">
      <h2>Lock Assets in the Always Succeed Script</h2>
      <p>
        Asset locking is a feature wherein certain assets are reserved on the
        smart contract. The assets can only be unlocked again when certain conditions
        are met. In this example, we will lock 2 ADA in the always succeed script.  By
        "always succeeds", we mean that the validator does not check for any specific 
        conditions, and so will always return true.
      </p>
      <p>
        First, we initialize a new <code>PlutusScript</code> with the
        serialized CBOR, and get the script's address.
      </p>

      <Codeblock data={code1} isJson={false} />

      <p>
        Next, we get the wallet's address (for multiple address wallet, we
        select the first address) and use that to build the hash, which will be
        used as the datum value.
      </p>

      <Codeblock data={code2} isJson={false} />

      <p>
        Then, we build the transaction and send the ADA to the script's address.
        Lastly, we sign and submit the transaction.
      </p>

      <Codeblock data={code3} isJson={false} />

      <p>
        That is all! You can now lock your ADA (and other assets) in the script.
        You can also give the demo a try: you can lock your ADA by clicking the
        button below.
      </p>

      {connected ? (
        <>
          <RunDemoButton
            runDemoFn={lockAsset}
            loading={loading}
            response={response}
            label="Lock asset"
          />
          <RunDemoResult response={response} />
        </>
      ) : (
        <ConnectCipWallet />
      )}
      <RunDemoResult response={responseError} label="Error" />

      <p>
        Here is an example of a successful transaction on{' '}
        <a
          href="https://preprod.cardanoscan.io/transaction/2e4019fd565262ba24f2712b0a778a42a0ef8e0c1c1e7a41f7b6f82ce00fba8a"
          target="_blank"
          rel="noreferrer"
        >
          preprod.cardanoscan.io
        </a>
        .
      </p>

      <p>Next, we will see how to unlock the asset.</p>
    </Element>
  );
}

function TransactionUnlock() {
  const [response, setResponse] = useState<null | any>(null);
  const [responseError, setResponseError] = useState<null | any>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const { wallet, connected } = useWallet();

  async function unlockAsset() {
    setLoading(true);
    setResponse(null);
    setResponseError(null);

    try {
      const script: PlutusScript = {
        code: getAlwaysSucceedScriptCbor(),
        version: 'V2',
      };
      const scriptAddress = resolvePlutusScriptAddress(script, 0);

      const address = (await wallet.getUsedAddresses())[0];
      const walletKeyhash = resolvePaymentKeyHash(address);

      const blockchainProvider = new KoiosProvider('preprod');
      const dataHash = resolveDataHash(walletKeyhash);
      const utxos = await blockchainProvider.fetchAddressUTxOs(
        scriptAddress,
        'lovelace'
      );
      let utxo = utxos.find((utxo: any) => {
        return utxo.output.dataHash == dataHash;
      });

      if (utxo) {
        const tx = new Transaction({ initiator: wallet })
          .redeemValue({
            value: utxo,
            script: script,
            datum: walletKeyhash,
          })
          .sendValue(address, utxo)
          .setRequiredSigners([address]);

        const unsignedTx = await tx.build();
        const signedTx = await wallet.signTx(unsignedTx, true);
        const txHash = await wallet.submitTx(signedTx);

        setResponse(txHash);
      } else {
        setResponseError(`No utxo found, please lock asset first`);
      }
    } catch (error) {
      setResponseError(`${error}`);
    }
    setLoading(false);
  }

  let code1 = ``;
  code1 += `const script: PlutusScript = {\n`;
  code1 += `  code: scriptCbor,\n`;
  code1 += `  version: 'V2',\n`;
  code1 += `};\n`;
  code1 += `const scriptAddress = resolvePlutusScriptAddress(script, 0);\n`;
  code1 += `\n`;
  code1 += `const address = (await wallet.getUsedAddresses())[0];\n`;
  code1 += `const walletKeyhash = resolvePaymentKeyHash(address);\n`;

  let code2 = ``;
  code2 += `const blockchainProvider = new KoiosProvider('preprod');\n`;
  code2 += `const dataHash = resolveDataHash(walletKeyhash);\n`;
  code2 += `const utxos = await blockchainProvider.fetchAddressUTxOs(\n`;
  code2 += `  scriptAddress,\n`;
  code2 += `  'lovelace'\n`;
  code2 += `);\n`;
  code2 += `let utxo = utxos.find((utxo: any) => {\n`;
  code2 += `  return utxo.output.dataHash == dataHash;\n`;
  code2 += `});\n`;

  let code3 = ``;
  code3 += `const tx = new Transaction({ initiator: wallet })\n`;
  code3 += `  .redeemValue({\n`;
  code3 += `    value: utxo,\n`;
  code3 += `    script: script,\n`;
  code3 += `    datum: walletKeyhash,\n`;
  code3 += `  })\n`;
  code3 += `  .sendValue(address, utxo)\n`;
  code3 += `  .setRequiredSigners([address]);\n`;
  code3 += `\n`;
  code3 += `const unsignedTx = await tx.build();\n`;
  code3 += `const signedTx = await wallet.signTx(unsignedTx, true);\n`;
  code3 += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <Element name="unlock">
      <h2>Unlock Asset from Always Succeed Script</h2>

      <p>
        As we may have locked assets in the contract, you can create
        transactions to unlock the assets.
      </p>

      <p>
        Similar to locking assets, let's get the <code>PlutusScript</code>,
        script address, wallet address and the wallet's keyhash.
      </p>

      <Codeblock data={code1} isJson={false} />

      <p>
        Then, we fetch the input UTXO from the script address. This input UTXO is
        needed for transaction builder. In this demo, we are using{' '}
        <code>KoiosProvider</code>, but this can be interchanged with other
        providers that Mesh provides, see{' '}
        <Link href="/apis/providers">Providers</Link>.
      </p>

      <Codeblock data={code2} isJson={false} />

      <p>
        Next, we build the transaction and send the ADA back to the wallet
        address. We use <code>redeemValue()</code> to consume the UTXO on the
        script, and <code>sendValue()</code> to send the ADA back to the wallet
        address. Note that here we do a partial sign. Lastly, we sign and submit
        the transaction.
      </p>

      <Codeblock data={code3} isJson={false} />

      <p>If you want to see it in action, click the button below to unlock your ADA.</p>

      {connected ? (
        <>
          <RunDemoButton
            runDemoFn={unlockAsset}
            loading={loading}
            response={response}
            label="Unlock asset"
          />
          <RunDemoResult response={response} />
        </>
      ) : (
        <ConnectCipWallet />
      )}
      <RunDemoResult response={responseError} label="Error" />

      <p>
        Here is an example of a successful transaction on{' '}
        <a
          href="https://preprod.cardanoscan.io/transaction/d08f6ab9b78d8459e3730faca3dc96b6cbc57ece36f0e3f9e7ae5cb89c94654b"
          target="_blank"
          rel="noreferrer"
        >
          preprod.cardanoscan.io
        </a>
        .
      </p>

      <p>
        Now, you have successfully locked and unlocked assets from the script.
        You can start your own project with our{' '}
        <a
          href="http://pluts-template.meshjs.dev/"
          target="_blank"
          rel="noreferrer"
        >
          plu-ts starter kit
        </a>
        .
      </p>
    </Element>
  );
}

/**
 * Hello Contract
 */

function HelloWorldScript() {
  let codeImport = ``;
  codeImport += `import {\n`;
  codeImport += `  bool,\n`;
  codeImport += `  compile,\n`;
  codeImport += `  makeValidator,\n`;
  codeImport += `  pfn,\n`;
  codeImport += `  Script,\n`;
  codeImport += `  PPubKeyHash,\n`;
  codeImport += `  PScriptContext,\n`;
  codeImport += `  bs,\n`;
  codeImport += `} from '@harmoniclabs/plu-ts';\n`;

  let code1 = ``;
  code1 += `const contract = pfn(\n`;
  code1 += `  [PPubKeyHash.type, bs, PScriptContext.type],\n`;
  code1 += `  bool\n`;
  code1 += `)((owner, message, ctx) => {\n`;
  code1 += `  const isBeingPolite = message.eq('Hello plu-ts');\n`;
  code1 += `\n`;
  code1 += `  const signedByOwner = ctx.tx.signatories.some(owner.eqTerm);\n`;
  code1 += `\n`;
  code1 += `  return isBeingPolite.and(signedByOwner);\n`;
  code1 += `});\n`;

  let code2 = ``;
  code2 += `const untypedValidator = makeValidator(contract);\n`;
  code2 += `const compiledContract = compile(untypedValidator);\n`;
  code2 += `\n`;
  code2 += `const script = new Script('PlutusScriptV2', compiledContract);`;

  let code3 = `const scriptCbor = script.cbor.toString();`;

  return (
    <Element name="helloscript">
      <h2>Hello plu-ts Script</h2>

      <p>
        In this section, we will be locking 2 ADA from your wallet to a{' '}
        <a
          href="https://pluts.harmoniclabs.tech/docs/examples/Hello%20World"
          target="_blank"
          rel="noreferrer"
        >
          Hello plu-ts
        </a>{' '}
        smart contract. Unlike the Always Succeed script, this script will only
        be able to unlock if we redeem with a string <code>Hello plu-ts</code>{' '}
        in our redeemer. Let's learn how we can do that.
      </p>

      <p>Let's import the necessary modules from plu-ts:</p>

      <Codeblock data={codeImport} isJson={false} />

      <p>
        Here is a <code>Hello plu-ts</code> script written in plu-ts:
      </p>

      <Codeblock data={code1} isJson={false} />

      <p>
        Next, we will execute <code>makeValidator()</code> so that the node will
        be able to evaluate it, <code>compile()</code> to compile the validator,
        and wrapping it in a <code>Script</code> that can be used offchain:
      </p>

      <Codeblock data={code2} isJson={false} />

      <p>Lasly, we will get the compiled contract's CBOR:</p>

      <Codeblock data={code3} isJson={false} />
    </Element>
  );
}

function HelloWorldLock() {
  const [response, setResponse] = useState<null | any>(null);
  const [responseError, setResponseError] = useState<null | any>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const { wallet, connected } = useWallet();

  async function lockAsset() {
    setLoading(true);
    setResponse(null);
    setResponseError(null);

    try {
      const script: PlutusScript = {
        code: getHelloScriptCbor(),
        version: 'V2',
      };
      const scriptAddress = resolvePlutusScriptAddress(script, 0);

      const address = (await wallet.getUsedAddresses())[0];
      const walletKeyhash: Data = resolvePaymentKeyHash(address);

      const tx = new Transaction({ initiator: wallet }).sendLovelace(
        {
          address: scriptAddress,
          datum: {
            value: walletKeyhash,
            inline: true,
          },
        },
        '2000000'
      );

      const unsignedTx = await tx.build();
      const signedTx = await wallet.signTx(unsignedTx);
      const txHash = await wallet.submitTx(signedTx);

      setResponse(txHash);
    } catch (error) {
      setResponseError(`${error}`);
    }
    setLoading(false);
  }

  let code1 = ``;
  code1 += `const script: PlutusScript = {\n`;
  code1 += `  code: scriptCbor,\n`;
  code1 += `  version: 'V2',\n`;
  code1 += `};\n`;
  code1 += `const scriptAddress = resolvePlutusScriptAddress(script, 0);\n`;

  let code2 = ``;
  code2 += `const address = (await wallet.getUsedAddresses())[0];\n`;
  code2 += `const walletKeyhash = resolvePaymentKeyHash(address);\n`;

  let code3 = ``;
  code3 += `const tx = new Transaction({ initiator: wallet })\n`;
  code3 += `  .sendLovelace(\n`;
  code3 += `    {\n`;
  code3 += `      address: scriptAddress,\n`;
  code3 += `      datum: {\n`;
  code3 += `        value: walletKeyhash,\n`;
  code3 += `        inline: true,\n`;
  code3 += `      },\n`;
  code3 += `    },\n`;
  code3 += `    '2000000'\n`;
  code3 += `  );\n`;
  code3 += `\n`;
  code3 += `const unsignedTx = await tx.build();\n`;
  code3 += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  code3 += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <Element name="hellolock">
      <h2>Lock ADA in Hello plu-ts Script</h2>

      <p>
        Similar to the Always Succeed script, we will be locking 2 ADA from your
        wallet to the{' '}
        <a
          href="https://pluts.harmoniclabs.tech/docs/examples/Hello%20World"
          target="_blank"
          rel="noreferrer"
        >
          Hello plu-ts
        </a>{' '}
        script. Let's see how we can do that.
      </p>

      <p>
        Firstly, we initialize a new <code>PlutusScript</code> with the
        serialized CBOR, and get the script's address.
      </p>

      <Codeblock data={code1} isJson={false} />

      <p>
        Next, we get the wallet's address (for multiple address wallet, we
        select the first address) and use that to build the hash, which will be
        used as the datum value.
      </p>

      <Codeblock data={code2} isJson={false} />

      <p>
        Then, we build the transaction and send the ADA to the script's address.
        We also include the datum value, which is the wallet's hash. Lastly, we
        sign and submit the transaction.
      </p>

      <Codeblock data={code3} isJson={false} />

      <p>To see it in action, connect your wallet and give it a try.</p>

      {connected ? (
        <>
          <RunDemoButton
            runDemoFn={lockAsset}
            loading={loading}
            response={response}
            label="Lock asset"
          />
          <RunDemoResult response={response} />
        </>
      ) : (
        <ConnectCipWallet />
      )}
      <RunDemoResult response={responseError} label="Error" />

      <p>
        Here is an example of a successful transaction on{' '}
        <a
          href="https://preprod.cardanoscan.io/transaction/6e04e5016274d8330d0132ea7ed9aceca8afc46e2b6d3e3eabe79ffe503485c4"
          target="_blank"
          rel="noreferrer"
        >
          preprod.cardanoscan.io
        </a>
        .
      </p>
    </Element>
  );
}

function HelloWorldUnlock() {
  const [response, setResponse] = useState<null | any>(null);
  const [responseError, setResponseError] = useState<null | any>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const { wallet, connected } = useWallet();

  async function unlockAsset() {
    setLoading(true);
    setResponse(null);
    setResponseError(null);

    try {
      const script: PlutusScript = {
        code: getHelloScriptCbor(),
        version: 'V2',
      };
      const scriptAddress = resolvePlutusScriptAddress(script, 0);
      const address = (await wallet.getUsedAddresses())[0];
      const walletKeyhash: Data = resolvePaymentKeyHash(address);

      const blockchainProvider = new BlockfrostProvider(
        process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_PREPROD!
      );

      const dataHash = resolveDataHash(walletKeyhash);
      const utxos = await blockchainProvider.fetchAddressUTxOs(
        scriptAddress,
        'lovelace'
      );
      let utxo = utxos.find((utxo: any) => {
        return utxo.output.dataHash == dataHash;
      });

      if (utxo) {
        const redeemer = {
          data: 'Hello plu-ts',
        };

        const tx = new Transaction({ initiator: wallet })
          .redeemValue({
            value: utxo,
            script: script,
            datum: utxo,
            redeemer: redeemer,
          })
          .sendValue(address, utxo)
          .setRequiredSigners([address]);

        const unsignedTx = await tx.build();
        const signedTx = await wallet.signTx(unsignedTx, true);
        const txHash = await wallet.submitTx(signedTx);

        setResponse(txHash);
      } else {
        setResponseError(`No utxo found, please lock asset first`);
      }
    } catch (error) {
      setResponseError(`${error}`);
    }
    setLoading(false);
  }

  let code1 = ``;
  code1 += `const script: PlutusScript = {\n`;
  code1 += `  code: scriptCbor,\n`;
  code1 += `  version: 'V2',\n`;
  code1 += `};\n`;
  code1 += `const scriptAddress = resolvePlutusScriptAddress(script, 0);\n`;
  code1 += `\n`;
  code1 += `const address = (await wallet.getUsedAddresses())[0];\n`;
  code1 += `const walletKeyhash = resolvePaymentKeyHash(address);\n`;

  let code2 = ``;
  code2 += `const dataHash = resolveDataHash(walletKeyhash);\n\n`;
  code2 += `const blockchainProvider = new KoiosProvider('preprod');\n`;
  code2 += `const utxos = await blockchainProvider.fetchAddressUTxOs(\n`;
  code2 += `  scriptAddress,\n`;
  code2 += `  'lovelace'\n`;
  code2 += `);\n\n`;
  code2 += `let utxo = utxos.find((utxo: any) => {\n`;
  code2 += `  return utxo.output.dataHash == dataHash;\n`;
  code2 += `});\n`;

  let codeRedeemer = ``;
  codeRedeemer += `const redeemer = {\n`;
  codeRedeemer += `  data: 'Hello plu-ts',\n`;
  codeRedeemer += `};\n`;

  let code3 = ``;
  code3 += `const tx = new Transaction({ initiator: wallet })\n`;
  code3 += `  .redeemValue({\n`;
  code3 += `    value: utxo,\n`;
  code3 += `    script: script,\n`;
  code3 += `    datum: utxo,\n`;
  code3 += `    redeemer: redeemer,\n`;
  code3 += `  })\n`;
  code3 += `  .sendValue(address, utxo)\n`;
  code3 += `  .setRequiredSigners([address]);\n`;
  code3 += `\n`;
  code3 += `const unsignedTx = await tx.build();\n`;
  code3 += `const signedTx = await wallet.signTx(unsignedTx, true);\n`;
  code3 += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <Element name="hellounlock">
      <h2>Unlock ADA from Hello plu-ts Script</h2>

      <p>
        Now that we have locked ADA in the Hello plu-ts script, let's see how we
        can unlock it. We will be using the same script as before. Let's get the{' '}
        <code>PlutusScript</code>, script address, wallet address and the
        wallet's keyhash.
      </p>

      <Codeblock data={code1} isJson={false} />

      <p>
        Then, we use <code>KoiosProvider</code> to fetch input UTXO from the
        script address. This input UTXO is needed for transaction builder. In
        this demo, we are using <code>KoiosProvider</code>, but this can be
        interchange with other providers that Mesh provides, see{' '}
        <Link href="/apis/providers">Providers</Link>.
      </p>

      <p>
        We use <code>resolveDataHash()</code> to get the data hash of the wallet
        address. Doing so allow us to retrive the UTXO that is locked in the
        script. We then use <code>find()</code> to filter the UTXO that is
        locked by the user who locked it.
      </p>

      <Codeblock data={code2} isJson={false} />

      <p>
        Next, we need to create a redeemer to redeem the locked asset from the
        script. The redeemer is the argument specified by the user that
        interacts with the smart contract In this contract, we want to send the
        string "Hello plu-ts".
      </p>

      <Codeblock data={codeRedeemer} isJson={false} />

      <p>
        Now that we have the input UTXO and the redeemer, we can build the
        transaction. We use <code>redeemValue()</code> to consume the UTXO on
        the script, and <code>sendValue()</code> to send the ADA back to the
        wallet address. Notice that we use <code>utxo</code> in the{' '}
        <code>redeemValue()</code>, this is how we can use reference input. Note
        that here we do a partial sign because we have smart contracts in the
        transaction. Lastly, we sign and submit the transaction.
      </p>

      <Codeblock data={code3} isJson={false} />

      <p>If you want to see it in action, click the button below to unlock your ADA.</p>

      {connected ? (
        <>
          <RunDemoButton
            runDemoFn={unlockAsset}
            loading={loading}
            response={response}
            label="Unlock asset"
          />
          <RunDemoResult response={response} />
        </>
      ) : (
        <ConnectCipWallet />
      )}
      <RunDemoResult response={responseError} label="Error" />

      <p>
        Here is an example of a successful transaction on{' '}
        <a
          href="https://preprod.cardanoscan.io/transaction/04bdbad42581958536532146a1815116ac7d78517d733df33b5a852af6bc26c6"
          target="_blank"
          rel="noreferrer"
        >
          preprod.cardanoscan.io
        </a>
        .
      </p>

      <p>
        Now, you have successfully locked and unlocked assets from the script.
        If you want to see the full code, you can check it out in our{' '}
        <a
          href="https://github.com/MeshJS/pluts-next-ts-template"
          target="_blank"
          rel="noreferrer"
        >
          GitHub
        </a>{' '}
        repo or start your own project with our{' '}
        <a
          href="http://pluts-template.meshjs.dev/"
          target="_blank"
          rel="noreferrer"
        >
          plu-ts starter kit
        </a>
        .
      </p>
    </Element>
  );
}

// function VestingScript() {
//   let codeImport = ``;
//   codeImport += `import {\n`;
//   codeImport += `  bool,\n`;
//   codeImport += `  compile,\n`;
//   codeImport += `  makeValidator,\n`;
//   codeImport += `  pBool,\n`;
//   codeImport += `  pfn,\n`;
//   codeImport += `  pstruct,\n`;
//   codeImport += `  Script,\n`;
//   codeImport += `  V2,\n`;
//   codeImport += `  PPubKeyHash,\n`;
//   codeImport += `  int,\n`;
//   codeImport += `  data,\n`;
//   codeImport += `  PScriptContext,\n`;
//   codeImport += `  pmatch,\n`;
//   codeImport += `} from '@harmoniclabs/plu-ts';\n`;

//   let code1 = ``;
//   code1 += `const VestingDatum = pstruct({\n`;
//   code1 += `  VestingDatum: {\n`;
//   code1 += `    beneficiary: PPubKeyHash.type,\n`;
//   code1 += `    deadline: int,\n`;
//   code1 += `  },\n`;
//   code1 += `});\n`;
//   code1 += `\n`;
//   code1 += `const contract = pfn(\n`;
//   code1 += `  [VestingDatum.type, data, PScriptContext.type],\n`;
//   code1 += `  bool\n`;
//   code1 += `)((datum, _redeemer, ctx) => {\n`;
//   code1 += `  const signedByBeneficiary = ctx.tx.signatories.some(\n`;
//   code1 += `    datum.beneficiary.eqTerm\n`;
//   code1 += `  );\n`;
//   code1 += `\n`;
//   code1 += `  const deadlineReached = pmatch(ctx.tx.interval.from.bound)\n`;
//   code1 += `    .onPFinite(({ _0: lowerInterval }) => datum.deadline.ltEq(lowerInterval))\n`;
//   code1 += `    ._((_) => pBool(false));\n`;
//   code1 += `\n`;
//   code1 += `  return signedByBeneficiary.and(deadlineReached);\n`;
//   code1 += `});`;

//   let code2 = ``;
//   code2 += `const untypedValidator = makeValidator(contract);\n`;
//   code2 += `const compiledContract = compile(untypedValidator);\n`;
//   code2 += `\n`;
//   code2 += `const script = new Script('PlutusScriptV2', compiledContract);`;

//   let code3 = `const scriptCbor = script.cbor.toString();`;

//   return (
//     <Element name="vesting">
//       <h2>Vesting Script</h2>

//       <p>
//         In this section, we will be locking 2 ADA from your wallet to a{' '}
//         <a
//           href="https://pluts.harmoniclabs.tech/docs/examples/Vesting"
//           target="_blank"
//           rel="noreferrer"
//         >
//           Vesting
//         </a>{' '}
//         smart contract. Unlike the Always Succeed script, this script will only
//         be able to unlock by the beneficiary after the deadline.
//       </p>

//       <p>Let's import the necessary modules from plu-ts:</p>

//       <Codeblock data={codeImport} isJson={false} />

//       <p>Here is a Vesting script written in plu-ts:</p>

//       <Codeblock data={code1} isJson={false} />

//       <p>
//         Next, we will execute <code>makeValidator()</code> so that the node will
//         be able to evaluate it, <code>compile()</code> to compile the validator,
//         and wrapping it in a <code>Script</code> that can be used offchain:
//       </p>

//       <Codeblock data={code2} isJson={false} />

//       <p>Lasly, we will get the compiled contract's CBOR:</p>

//       <Codeblock data={code3} isJson={false} />
//     </Element>
//   );
// }

// function VestingLock() {
//   const [response, setResponse] = useState<null | any>(null);
//   const [responseError, setResponseError] = useState<null | any>(null);
//   const [loading, setLoading] = useState<boolean>(false);
//   const { wallet, connected } = useWallet();

//   async function lockAsset() {
//     setLoading(true);
//     setResponse(null);
//     setResponseError(null);

//     try {
//       const script: PlutusScript = {
//         code: getVestingScriptCbor(),
//         version: 'V2',
//       };
//       const scriptAddress = resolvePlutusScriptAddress(script, 0);
//       console.log('scriptAddress', scriptAddress);

//       const address = (await wallet.getUsedAddresses())[0];

//       const nowPosix = Date.now();
//       console.log('nowPosix', nowPosix);

//       const datum: Data = {
//         alternative: 0,
//         fields: [resolvePaymentKeyHash(address), nowPosix + 10_000],
//       };
//       console.log('datum', resolvePaymentKeyHash(address), nowPosix + 10_000);

//       const tx = new Transaction({ initiator: wallet }).sendLovelace(
//         {
//           address: scriptAddress,
//           datum: {
//             value: datum,
//             inline: true,
//           },
//         },
//         '2000000'
//       );

//       const unsignedTx = await tx.build();
//       const signedTx = await wallet.signTx(unsignedTx);
//       const txHash = await wallet.submitTx(signedTx);

//       setResponse(txHash);
//     } catch (error) {
//       setResponseError(`${error}`);
//     }
//     setLoading(false);
//   }

//   return (
//     <Element name="vestinglock">
//       <h2>Lock ADA in Vesting Script</h2>

//       <p></p>

//       {connected ? (
//         <>
//           <RunDemoButton
//             runDemoFn={lockAsset}
//             loading={loading}
//             response={response}
//             label="Lock asset"
//           />
//           <RunDemoResult response={response} />
//         </>
//       ) : (
//         <ConnectCipWallet />
//       )}
//       <RunDemoResult response={responseError} label="Error" />
//     </Element>
//   );
// }

// function VestingUnlock() {
//   const [response, setResponse] = useState<null | any>(null);
//   const [responseError, setResponseError] = useState<null | any>(null);
//   const [loading, setLoading] = useState<boolean>(false);
//   const { wallet, connected } = useWallet();

//   async function unlockAsset() {
//     setLoading(true);
//     setResponse(null);
//     setResponseError(null);

//     try {
//       const script: PlutusScript = {
//         code: getVestingScriptCbor(),
//         version: 'V2',
//       };
//       const scriptAddress = resolvePlutusScriptAddress(script, 0);
//       console.log('scriptAddress', scriptAddress);
//       const address = (await wallet.getUsedAddresses())[0];

//       /**
//        *
// 556f3a70b8a68081cf36c918dd9933abdca34f20fc534499c817182b 1681052219252

// 5867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f 1681132778699

// addr_test1wzaax9v49zvk592unvgjh6az2597he2z8779jmhcmxkw3mqn5u4kd
// datum 5867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f 1681146278850
//        */
//       const datum: Data = {
//         alternative: 0,
//         fields: [resolvePaymentKeyHash(address), 1681146278850],
//       };

//       // const blockchainProvider = new KoiosProvider('preprod');
//       const blockchainProvider = new BlockfrostProvider(
//         process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_PREPROD!
//       );

//       const dataHash = resolveDataHash(datum);
//       const utxos = await blockchainProvider.fetchAddressUTxOs(
//         scriptAddress,
//         'lovelace'
//       );
//       let utxo = utxos.find((utxo: any) => {
//         return utxo.output.dataHash == dataHash;
//       });
//       console.log('dataHash', dataHash);
//       console.log('utxo', utxo);

//       if (utxo) {
//         const redeemer = {
//           data: 0,
//         };

//         const tx = new Transaction({ initiator: wallet })
//           .redeemValue({
//             value: utxo,
//             script: script,
//             datum: utxo,
//             redeemer: redeemer,
//           })
//           .sendValue(address, utxo)
//           .setRequiredSigners([address])
//           .setTimeToStart(Date.now().toString());
//         // .setTimeToExpire('9999999999999')
//         const unsignedTx = await tx.build();
//         const signedTx = await wallet.signTx(unsignedTx, true);
//         console.log('signedTx', signedTx);
//         // const txHash = await wallet.submitTx(signedTx);
//         const txHash = await blockchainProvider.submitTx(signedTx);

//         setResponse(txHash);
//       } else {
//         setResponseError(`No utxo found, please lock asset first`);
//       }
//     } catch (error) {
//       setResponseError(`${error}`);
//     }
//     setLoading(false);
//   }

//   return (
//     <Element name="vestingunlock">
//       <h2>Unlock ADA from Vesting Script</h2>

//       {connected ? (
//         <>
//           <RunDemoButton
//             runDemoFn={unlockAsset}
//             loading={loading}
//             response={response}
//             label="Unlock asset"
//           />
//           <RunDemoResult response={response} />
//         </>
//       ) : (
//         <ConnectCipWallet />
//       )}
//       <RunDemoResult response={responseError} label="Error" />
//     </Element>
//   );
// }

export default GuidePlutsPage;
