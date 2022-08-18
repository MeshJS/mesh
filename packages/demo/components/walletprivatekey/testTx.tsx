import { useState, useEffect } from 'react';
import { WalletPrivateKeyService, TransactionService } from '@martifylabs/mesh';
import Mesh from '@martifylabs/mesh';
import type {UTxO, Asset} from '@martifylabs/mesh';
import Button from '../ui/button';

export default function TestTx() {

  async function makeTx() {

    const myaddress =
      'addr_test1qr3ctze63ps2swpynyqz9lkr39h0q5uq4uq74tlauqdkpukqju2u7lfjyefszazk3vfmd2umuhq2z26c9hpfya0fvk2qxtzvhd';
    const myencryptedRootKey =
      'abcdef88abcdef88abcdef88abcdef88abcdef88abcdef88abcdef88abcdef88abcdef888811abcdef88881119ee4461d9bba1a1f873b9b98a98ea63ae6fa11b600938d4efb100650d2cea5d4bd187d713494f422801bb477d67bc83b6fdb084f4dd3db731c81d42e22bfabd1285fbf5b4ea12d03d4a7233ec889beb32ed38ad7ec28c65ff56a69f43c0c9ec3cdb211339809221d538d222d204f104';
    const mypassword = '12345678';

    const wallet = WalletPrivateKeyService.loadWallet({
      encryptedRootKey: myencryptedRootKey,
      password: mypassword,
    });

    console.log("wallet", wallet);

    // get utxo from bf

    await Mesh.blockfrost.init({
      blockfrostApiKey: process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_TESTNET!,
      network: 0,
    });

    let utxosBf: { output_index: string; tx_hash: string; amount: [] }[] =
      await Mesh.blockfrost.addressesAddressUtxos({
        address: myaddress,
      });
    console.log('utxos 1', utxosBf);
    const utxos = utxosBf.map((utxo, i) => {
      return {
        input: { outputIndex: parseInt(utxo.output_index), txHash: utxo.tx_hash },
        output: {
          address: myaddress,
          amount: utxo.amount,
        },
      };
    });
    utxos as UTxO[];
    console.log('utxos 2', utxos);

    // make tx

    const tx = new TransactionService({})
    tx.sendLovelace(
      'addr_test1qq5tay78z9l77vkxvrvtrv70nvjdk0fyvxmqzs57jg0vq6wk3w9pfppagj5rc4wsmlfyvc8xs7ytkumazu9xq49z94pqzl95zt',
      '1500000'
    );
    tx.setTxInputs(utxos);
    tx.setChangeAddress(myaddress);

    const unsignedTx = await tx.build();
    console.log("unsignedTx", unsignedTx);

    // sign tx

    let signedTx = WalletPrivateKeyService.signTxWithPassword({
      unsignedTx: unsignedTx,
      encryptedRootKey: myencryptedRootKey,
      password:mypassword,
    });
    console.log("signedTx", signedTx);

    let txHash = await Mesh.blockfrost.transactionSubmitTx({tx: signedTx});
    console.log("txHash", txHash);


  }

  return (
    <>
      <h2>Test Tx</h2>
      <p className="lead">
        Here we debug transactions with private key wallets.
      </p>
      <Button onClick={() => makeTx()}>Make Tx</Button>
    </>
  );
}
