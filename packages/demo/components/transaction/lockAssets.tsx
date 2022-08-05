import { useState, useEffect } from 'react';
import Mesh from '@martifylabs/mesh';
import { Button, Card, Codeblock, Input } from '../../components';
import useWallet from '../../contexts/wallet';
import { TransactionService } from '@martifylabs/mesh';

export default function LockAssets() {
  return (
    <Card>
      <div className="grid gap-4 grid-cols-2">
        <div className="">
          <h3>Lock assets SC</h3>
          <p>WIP</p>
        </div>
        <div className="mt-8">
          <CodeDemo />
        </div>
      </div>
    </Card>
  );
}

function CodeDemo() {
  const { walletConnected } = useWallet();
  const [state, setState] = useState<number>(0);

  async function debug() {

    console.log('debug');

    let data = {
      addr: 'addr_something',
      price: 5,
      mapofstuffs: {
        a: 1,
        b: 'a',
        c: {
          d: 2,
          e: 'b',
        },
      },
      // listofstuffs: [4, 3, 2, 1],
    };
    const plustusdata = TransactionService.debug(data);
    console.log('plustusdata', plustusdata);

    /**
     * LOCK
     */

    // const tx = await Mesh.transaction.build({
    //   outputs: [
    //     {
    //       address:
    //         'addr_test1wpnlxv2xv9a9ucvnvzqakwepzl9ltx7jzgm53av2e9ncv4sysemm8',
    //       assets: {
    //         'f57f145fb8dd8373daff7cf55cea181669e99c4b73328531ebd4419a.SOCIETY': 1,
    //         lovelace: 3000000,
    //       },
    //     },
    //   ],
    //   hasDatum: true,
    //   blockfrostApiKey:
    //     (await Mesh.wallet.getNetworkId()) === 1
    //       ? process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_MAINNET!
    //       : process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_TESTNET!,
    //   network: await Mesh.wallet.getNetworkId(),
    // });
    // console.log('tx', tx);

    // const signature = await Mesh.wallet.signTx({ tx });

    // const txHash = await Mesh.wallet.submitTransaction({
    //   tx: tx,
    //   witnesses: [signature],
    // });
    // console.log('txHash', txHash);

    /**
     * UNLOCK
     */

    //  const txHash = await Mesh.transaction.buildSCv3({
    //   ownerAddress: await Mesh.wallet.getWalletAddress(),
    //   scriptAddress:
    //     'addr_test1wpnlxv2xv9a9ucvnvzqakwepzl9ltx7jzgm53av2e9ncv4sysemm8',
    //   blockfrostApiKey:
    //     (await Mesh.wallet.getNetworkId()) === 1
    //       ? process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_MAINNET!
    //       : process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_TESTNET!,
    //   network: await Mesh.wallet.getNetworkId(),
    // });
    // console.log('tx', txHash);

    /**
     * to check BF tx hash
     */
    // await Mesh.blockfrost.init({
    //   blockfrostApiKey: process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_TESTNET!,
    //   network: 0,
    // });
    // let result = await Mesh.blockfrost.transactionsTransactionUTXOs({
    //   hash: '3c0fc4774e529432b2eaa654720231ad6c6d92ae2a4a7ab2544a93dcfa3c8561',
    // });
    // console.log('result', result);
  }

  return (
    <>
      <Button
        onClick={() => debug()}
        // disabled={!walletConnected || state == 1}
      >
        debug
      </Button>
    </>
  );
}
