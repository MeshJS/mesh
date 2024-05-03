import { MeshVestingContract } from '@meshsdk/contracts';
import { YaciProvider } from '@meshsdk/core';
import { Transaction } from '@meshsdk/core';
import { AppWallet } from '@meshsdk/core';
import { Asset, MeshTxBuilder } from '@meshsdk/core';
import { useState } from 'react';

/**
 * https://github.com/bloxbean/yaci-devkit
 *
 * run docker
 *
 * sh start.sh
 * sh yaci-cli.sh
 *
 * create-node -o --start
 *
 * topup addr_test1vpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0c7e4cxr 20
 * topup addr_test1vzzqs77gk87vjuvtqvh0ndfj7jhyn5etpwh6neuqjjp6gvccsv2cg 20
 *
 * http://localhost:8080/swagger-ui/index.html
 * http://localhost:5173
 */

const wallet_1_addr =
  'addr_test1vpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0c7e4cxr';
const wallet_2_addr =
  'addr_test1vzzqs77gk87vjuvtqvh0ndfj7jhyn5etpwh6neuqjjp6gvccsv2cg';
const wallet_1_key =
  'xprv1cqa46gk29plgkg98upclnjv5t425fcpl4rgf9mq2txdxuga7jfq5shk7np6l55nj00sl3m4syzna3uwgrwppdm0azgy9d8zahyf32s62klfyhe0ayyxkc7x92nv4s77fa0v25tufk9tnv7x6dgexe9kdz5gpeqgu';
const wallet_2_key =
  'xprv1hrx48cklpwdzjz529zg85zjguw4qywp78687mxxpnt9xuxgx5pfupgccv808pn2rp7l6fhujt8tjvuu6tfjxlgqswyrf89f3ehczj5390vfsruelhjgr6h5puyg4n0sh957tu7t4wxah23s3szw6rc34rua5r46x';

export default function Yaci() {
  const [savedTxHash, setSavedTxHash] = useState<string>('');

  function getWallet(id = 1) {
    const blockchainProvider = new YaciProvider('http://localhost:8080/api/v1');

    const wallet = new AppWallet({
      networkId: 0,
      fetcher: blockchainProvider,
      submitter: blockchainProvider,
      key: {
        type: 'root',
        bech32: id == 2 ? wallet_2_key : wallet_1_key,
      },
    });

    return wallet;
  }

  async function checkUtxo() {
    const blockchainProvider = new YaciProvider('http://localhost:8080/api/v1');
    const utxos = await blockchainProvider.fetchAddressUTxOs(wallet_1_addr);
    console.log(1, utxos);
    // const pp = await blockchainProvider.fetchProtocolParameters();
    // console.log(2, pp);
  }

  async function buildTxSendAda() {
    const address = wallet_1_addr;

    const blockchainProvider = new YaciProvider('http://localhost:8080/api/v1');

    const wallet = getWallet();

    const utxos = await blockchainProvider.fetchAddressUTxOs(address);
    console.log('utxos', utxos);

    const tx = new Transaction({ initiator: wallet });
    tx.setTxInputs(utxos);
    tx.sendLovelace(address, '10000000');

    const unsignedTx = await tx.build();
    const signedTx = await wallet.signTx(unsignedTx);
    const txHash = await wallet.submitTx(signedTx);
    console.log('txHash', txHash);
  }

  function vestingContract(wallet) {
    const blockchainProvider = new YaciProvider('http://localhost:8080/api/v1');

    const meshTxBuilder = new MeshTxBuilder({
      fetcher: blockchainProvider,
      submitter: blockchainProvider,
    });

    const contract = new MeshVestingContract({
      mesh: meshTxBuilder,
      fetcher: blockchainProvider,
      wallet: wallet,
      networkId: 0,
    });

    return contract;
  }

  async function vestingLock() {
    const wallet = getWallet();

    const contract = vestingContract(wallet);

    const assets: Asset[] = [
      {
        unit: 'lovelace',
        quantity: '8000000',
      },
    ];

    const lockUntilTimeStamp = new Date();
    lockUntilTimeStamp.setMinutes(lockUntilTimeStamp.getMinutes() + 1);

    const beneficiary = wallet_2_addr;

    // todo hinson
    const tx = await contract.depositFund(
      assets,
      lockUntilTimeStamp.getTime(),
      beneficiary
    );

    // const signedTx = await wallet.signTx(tx);
    // const txHash = await wallet.submitTx(signedTx);
    // console.log('txHash', txHash);
    // setSavedTxHash(txHash);
  }

  async function vestingUnlock() {
    const wallet = getWallet(2);

    const contract = vestingContract(wallet);

    const utxo = await contract.getUtxoByTxHash(savedTxHash);
    console.log('utxo', utxo);

    if (utxo) {
      const tx = await contract.withdrawFund(utxo);
      const signedTx = await wallet.signTx(tx, true);
      const txHash = await wallet.submitTx(signedTx);
      console.log('txHash', txHash);
    }
  }

  return (
    <>
      <div className="flex gap-4 m-4">
        <button onClick={() => checkUtxo()}>check utxo</button>
        <button onClick={() => buildTxSendAda()}>send ada</button>
        <button onClick={() => vestingLock()}>vesting lock</button>
        <button onClick={() => vestingUnlock()}>vesting unlock</button>
      </div>
    </>
  );
}
