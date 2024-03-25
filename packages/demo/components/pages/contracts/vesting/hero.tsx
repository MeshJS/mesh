import { LockClosedIcon } from '@heroicons/react/24/solid';
import { CardanoWallet, useWallet } from '@meshsdk/react';
import Button from '../../../ui/button';
import Card from '../../../ui/card';
import { useState } from 'react';
import RunDemoResult from '../../../common/runDemoResult';
import Codeblock from '../../../ui/codeblock';
import Link from 'next/link';
import { MeshVestingContract } from '@meshsdk/contracts';
import {
  Asset,
  KoiosProvider,
  MeshTxBuilder,
  Transaction,
  resolvePaymentKeyHash,
  resolveSlotNo,
} from '@meshsdk/core';

export default function Hero() {
  let codeInit = ``;

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
            lockup period. Such a system is designed to incentivize the employee
            to remain with the organization for the agreed-upon duration,
            thereby fostering commitment and stability within the workforce.
          </p>
          <p>
            Through the utilization of vesting contracts, organizations
            establish a mechanism to encourage employee retention by linking
            financial rewards to tenure. By requiring employees to wait until
            the end of a designated lockup period before accessing their
            promised funds, the organization promotes loyalty and long-term
            engagement among its workforce. This approach serves to align the
            interests of both the employee and the organization, fostering
            mutual investment in each other's success and contributing to the
            establishment of a stable and committed workforce.
          </p>
          <p>
            There are 4 actions (or endpoints) available to interact with this
            smart contract:
          </p>
          <ul>
            <li>deposit asset</li>
            <li>withdraw asset</li>
          </ul>
          {/* <p>
            Do check out the{' '}
            <Link href="/guides/custom-marketplace">guide</Link> and the{' '}
            <Link href="/starter-templates">marketplace starter kit</Link> that
            might help you get started. This contract is written in{' '}
            <a
              href="https://pluts.harmoniclabs.tech/"
              target="_blank"
              rel="noreferrer"
            >
              plu-ts
            </a>
            , you can{' '}
            <a
              href="https://github.com/MeshJS/mesh/blob/main/packages/contracts/src/marketplace/contract.ts"
              target="_blank"
              rel="noreferrer"
            >
              view the contract on GitHub
            </a>
            .
          </p> */}
        </div>
        <div className="col-span-2">
          <h3>Initialize the Marketplace</h3>
          <p>
            Utilizing the Marketplace contract requires a blockchain provider
            and a connected browser wallet. Here is an example how we can
            initialize the Marketplace.
          </p>
          <Codeblock data={codeInit} isJson={false} />
          <p>
            You can define the <code>fetcher</code> and <code>submitter</code>{' '}
            with one of our <Link href="/providers">blockchain providers</Link>{' '}
            or use your own custom provider. We use these <code>fetcher</code>{' '}
            and <code>submitter</code> to query for locked UTxO and submit
            transactions. The{' '}
            <Link href="/apis/browserwallet">connected wallet</Link> are defined
            in the <code>initiator</code> and <code>signer</code>. The network
            can defined in <code>network</code>, it has to be one of the
            following values:{' '}
            <code>"testnet" | "preview" | "preprod" | "mainnet"</code>
          </p>
          <p>
            The <code>owner</code> is the address of the marketplace owner which
            will receive the marketplace fee. The <code>percentage</code> is the
            percentage of the sale price that the marketplace <code>owner</code>{' '}
            will take. Note that, the fee numerator is in the order of millions,
            for example <code>3000</code> implies a fee of{' '}
            <code>3000/1_000_000</code> (or <code>0.003</code>) implies a fee of{' '}
            <code>0.3%</code>.
          </p>
        </div>
        <div className="col-span-2">
          <Demo />
        </div>
      </div>
    </>
  );
}

function Demo() {
  const { wallet, connected } = useWallet();
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);

  async function depositAsset() {
    const koiosProvider = new KoiosProvider('preprod', '<token>');

    const meshTxBuilder = new MeshTxBuilder({
      fetcher: koiosProvider,
      submitter: koiosProvider,
      evaluator: koiosProvider,
    });

    const contract = new MeshVestingContract({
      mesh: meshTxBuilder,
      fetcher: koiosProvider,
      wallet: wallet,
    });
    console.log(111, contract);

    //

    const asset: Asset = {
      unit: 'lovelace',
      quantity: '10000000',
    };

    const lockUntilTimeStamp = new Date().getFullYear() + 1;

    const beneficiary =
      'addr_test1qqnnkc56unmkntvza0x70y65s3fs5awdpks7wpr4yu0mqm5vldqg2n2p8y4kyjm8sqfyg0tpq9042atz0fr8c3grjmys2gv2h5';

    const networkId = 0; // for preprod

    const tx = await contract.depositFund(
      [asset],
      lockUntilTimeStamp,
      beneficiary,
      networkId
    );
    console.log(222, 'tx', tx);
  }

  return (
    <Card>
      <h3>Try the demo</h3>
      <p>You can test this martetplace smart contract on this page.</p>
      <p>
        Firstly, switch your wallet network to one of the testnets, and connect
        wallet.
      </p>
      <CardanoWallet />
      {connected && (
        <>
          <p>Next, mint a Mesh Token. We will use list this NFT for sale.</p>
          <Button
            onClick={() => depositAsset()}
            style={
              loading ? 'warning' : response !== null ? 'success' : 'light'
            }
            disabled={loading}
          >
            Deposit 10 ADA
          </Button>
          {response !== null && (
            <>
              {/* <p>Mesh token minted successful.</p>
              <RunDemoResult response={response} label="Transaction hash" /> */}
            </>
          )}
        </>
      )}
    </Card>
  );
}
