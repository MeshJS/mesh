import { ArrowsPointingOutIcon } from '@heroicons/react/24/solid';
import Codeblock from '../../../ui/codeblock';
import Link from 'next/link';

export default function Hero() {
  let code = ``;
  code += `import { BlockfrostProvider, MeshTxBuilder } from '@meshsdk/core';\n`;
  code += `import { MeshPaymentSplitterContract } from '@meshsdk/contracts';\n`;
  code += `import { useWallet } from '@meshsdk/react';\n`;
  code += `\n`;
  code += `const { connected, wallet } = useWallet();\n`;
  code += `\n`;
  code += `const blockchainProvider = new BlockfrostProvider(APIKEY);\n`;
  code += `\n`;
  code += `const meshTxBuilder = new MeshTxBuilder({\n`;
  code += `  fetcher: blockchainProvider,\n`;
  code += `  submitter: blockchainProvider,\n`;
  code += `});\n`;
  code += `\n`;
  code += `const contract = new MeshPaymentSplitterContract(\n`;
  code += `  {\n`;
  code += `    mesh: meshTxBuilder,\n`;
  code += `    fetcher: blockchainProvider,\n`;
  code += `    wallet: wallet,\n`;
  code += `    networkId: 0,\n`;
  code += `  },\n`;
  code += `  [\n`;
  code += `    'addr_test1vpg334d6skwu6xxq0r4lqrnsjd5293n8s3d80em60kf6guc7afx8k',\n`;
  code += `    'addr_test1vp4l2kk0encl7t7972ngepgm0044fu8695prkgh5vjj5l6sxu0l3p',\n`;
  code += `    'addr_test1vqqnfs2vt42nq4htq460wd6gjxaj05jg9vzg76ur6ws4sngs55pwr',\n`;
  code += `    'addr_test1vqv2qhqddxmf87pzky2nkd9wm4y5599mhp62mu4atuss5dgdja5pw',\n`;
  code += `  ]\n`;

  return (
    <>
      <header className="mb-4 lg:mb-6">
        <h2 className="mb-4 text-4xl tracking-tight font-extrabold text-gray-900 dark:text-white">
          <div className="flex items-center">
            <div className="p-2 mr-4">
              <ArrowsPointingOutIcon className="w-16 h-16" />
            </div>
            <span>Payment Splitter</span>
          </div>
        </h2>
        <p className="mb-8 font-light text-gray-500 sm:text-xl dark:text-gray-400">
          Split payouts equally among a list of specified payees
        </p>
        <p>
          A payment splitter can be used for example to create a shared project
          donation address, ensuring that all payees receive the same amount
        </p>
        <p>
          Sending lovelace to the contract works similarly to sending lovelace
          to any other address. The payout transaction can only be submitted by
          one of the payees, and the output addresses are restricted to the
          payees. The output sum must be equally divided to ensure the
          transaction is successful.
        </p>
      </header>
      <div className="grid grid-cols-1 px-4 lg:grid-cols-3 lg:gap-4 pb-16">
        <div className="col-span-2">
          <p>
            There are 2 actions (or endpoints) available to interact with this
            smart contract:
          </p>
          <ul>
            <li>Send Lovelace to Payment Splitter</li>
            <li>Trigger Payout</li>
          </ul>
          <p>
            To initialize the payment splitter, we need to initialize a{' '}
            <Link href="/providers">provider</Link>, a{' '}
            <code>MeshTxBuilder</code>, and a{' '}
            <code>MeshPaymentSplitterContract</code>. Additionally, a list of
            payees is required to define the allowed payout addresses for the
            contract.
          </p>
          <Codeblock data={code} isJson={false} />
          <p>
            Both on-chain and off-chain codes are open-source and available on{' '}
            <Link href="https://github.com/MeshJS/mesh/tree/main/packages/contracts/src/payment-splitter">
              Mesh Github Repository
            </Link>
            .
          </p>
        </div>
      </div>
    </>
  );
}
