import { LockClosedIcon } from '@heroicons/react/24/solid';
import Link from 'next/link';
import Codeblock from '../../../ui/codeblock';

export default function Hero() {
  let code = ``;
  code += `import { BlockfrostProvider, MeshTxBuilder } from '@meshsdk/core';\n`;
  code += `import { MeshVestingContract } from '@meshsdk/contracts';\n`;
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
  code += `const contract = new MeshVestingContract({\n`;
  code += `  mesh: meshTxBuilder,\n`;
  code += `  fetcher: blockchainProvider,\n`;
  code += `  wallet: wallet,\n`;
  code += `  networkId: 0,\n`;
  code += `});\n`;

  return (
    <>
      <header className="mb-4 lg:mb-6">
        <h2 className="mb-4 text-4xl tracking-tight font-extrabold text-gray-900 dark:text-white">
          <div className="flex items-center">
            <div className="p-2 mr-4">
              <LockClosedIcon className="w-16 h-16" />
            </div>
            <span>Vesting</span>
          </div>
        </h2>
        <p className="mb-8 font-light text-gray-500 sm:text-xl dark:text-gray-400">
          Vesting contract is a smart contract that locks up funds for a period
          of time and allows the owner to withdraw the funds after the lockup
          period.
        </p>
      </header>
      <div className="grid grid-cols-1 px-4 lg:grid-cols-3 lg:gap-4 pb-16">
        <div className="col-span-2">
          <p>
            When a new employee joins an organization, they typically receive a
            promise of compensation to be disbursed after a specified duration
            of employment. This arrangement often involves the organization
            depositing the funds into a vesting contract, with the employee
            gaining access to the funds upon the completion of a predetermined
            lockup period. Through the utilization of vesting contracts,
            organizations establish a mechanism to encourage employee retention
            by linking financial rewards to tenure.
          </p>
          <p>
            There are 2 actions (or endpoints) available to interact with this
            smart contract:
          </p>
          <ul>
            <li>deposit asset</li>
            <li>withdraw asset</li>
          </ul>
          <p>
            To initialize the escrow, we need to initialize a{' '}
            <Link href="/providers">provider</Link>, <code>MeshTxBuilder</code>{' '}
            and <code>MeshVestingContract</code>.
          </p>
          <Codeblock data={code} isJson={false} />
          <p>
            Both on-chain and off-chain codes are open-source and available on{' '}
            <Link href="https://github.com/MeshJS/mesh/tree/main/packages/contracts/src/vesting">
              Mesh Github Repository
            </Link>
            .
          </p>
        </div>
      </div>
    </>
  );
}
