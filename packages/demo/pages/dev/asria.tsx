import type { NextPage } from 'next';
import Button from '../../components/ui/button';
import { BlockfrostProvider, Transaction } from '@meshsdk/core';
import { useState } from 'react';
import Codeblock from '../../components/ui/codeblock';
import { CardanoWallet, useWallet } from '@meshsdk/react';

const AsriaPage: NextPage = () => {
  const policyId = 'ba95e4948adfb81d484a4e6d341892a154b819d597b0f0e14b77c48e';
  const bfMain = `mainnetzH9AiS9qETHMosHBFbeY82umblZXMXZw`;
  const payPerNFT = 25000000;
  const bonusPerNFTSet = 25000000;

  const stages = {
    init: 'init',
    gettingAssets: 'gettingAssets',
    gettingAddresses: 'gettingAddresses',
    gottenAddresses: 'gottenAddresses',
    createTransaction: 'createTransaction',
    transactionComplete: 'transactionComplete',
  };

  const { wallet, connected } = useWallet();

  const [stage, setStage] = useState(stages.init);
  const [numAssetsFound, setNumAssetsFound] = useState(0);
  const [processednumAssets, setProcessedNumAssets] = useState(0);
  const [addressesAssets, setAddressesAssets] = useState({});
  const [txHash, setTxHash] = useState('');

  async function getHolders() {
    const blockchainProvider = new BlockfrostProvider(bfMain);
    setStage(stages.gettingAssets);
    const assets = await blockchainProvider.fetchAssetsSpecificPolicy(policyId);
    setNumAssetsFound(assets.length);

    setStage(stages.gettingAddresses);
    let addressesUnits = {};
    for (let i = 0; i < assets.length; i++) {
      const unit = assets[i].unit;
      const unitAddresses = await blockchainProvider.fetchAssetAddresses(unit);
      if (unitAddresses.length == 1) {
        const address = unitAddresses[0].address;
        if (!(address in addressesUnits)) {
          addressesUnits[address] = {
            assets: [],
            amountReward: 0,
          };
        }
        addressesUnits[address].assets.push(unit);

        let amountPay = addressesUnits[address].assets.length * payPerNFT;
        let bonus =
          Math.floor(addressesUnits[address].assets.length / 4) *
          bonusPerNFTSet;
        addressesUnits[address].amountReward = amountPay + bonus;
      }
      setProcessedNumAssets(i);
    }

    setAddressesAssets(addressesUnits);
    setStage(stages.gottenAddresses);
  }

  async function createTx() {
    setStage(stages.createTransaction);
    const tx = new Transaction({ initiator: wallet });
    for (let address in addressesAssets) {
      const addressAssets = addressesAssets[address];
      tx.sendLovelace(address, addressAssets.amountReward.toString());
    }

    const unsignedTx = await tx.build();
    const signedTx = await wallet.signTx(unsignedTx);
    const txHash = await wallet.submitTx(signedTx);
    setTxHash(txHash);
    setStage(stages.transactionComplete);
  }

  return (
    <>
      <section className="bg-white dark:bg-gray-900">
        <div className="py-8 px-4 mx-auto max-w-screen-xl sm:py-16 lg:px-6">
          {stage == stages.init && (
            <Button onClick={() => getHolders()}>Get Holders</Button>
          )}

          <p>Stage: {stage}</p>
          {stage == stages.gettingAddresses && (
            <p>Num. assets found: {numAssetsFound}</p>
          )}

          {processednumAssets > 0 && (
            <p>Num. assets processed: {processednumAssets}</p>
          )}

          {Object.keys(addressesAssets).length > 0 && (
            <p>Num. addresses: {Object.keys(addressesAssets).length}</p>
          )}

          {Object.keys(addressesAssets).length > 0 && (
            <>
              <p>Addresses and its assets:</p>
              <Codeblock data={addressesAssets} isJson={true} />
            </>
          )}

          {stage == stages.gottenAddresses && (
            <p>
              Total Reward in ADA:{' '}
              {Object.keys(addressesAssets).reduce(function (
                accumulator,
                address
              ) {
                const addressAssets = addressesAssets[address];
                return accumulator + addressAssets.amountReward / 1000000;
              },
              0)}{' '}
              ADA
            </p>
          )}
          {stage == stages.gottenAddresses && (
            <>
              {connected ? (
                <Button onClick={() => createTx()}>Create transaction</Button>
              ) : (
                <CardanoWallet />
              )}
            </>
          )}

          {stage == stages.createTransaction && <p>Creating transaction...</p>}

          {stage == stages.transactionComplete && (
            <p>Transaction completed, tx hash: {txHash}</p>
          )}
        </div>
      </section>
    </>
  );
};

export default AsriaPage;
