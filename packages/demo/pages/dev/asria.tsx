import type { NextPage } from 'next';
import Button from '../../components/ui/button';
import {
  BlockfrostProvider,
  Transaction,
  resolveRewardAddress,
} from '@meshsdk/core';
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
    gettingStakeAddresses: 'gettingStakeAddresses',
    gottenStakeAddresses: 'gottenStakeAddresses',
    createTransaction: 'createTransaction',
    transactionComplete: 'transactionComplete',
  };

  const { wallet, connected } = useWallet();

  const [stage, setStage] = useState(stages.init);
  const [numAssetsFound, setNumAssetsFound] = useState(0);
  const [processednumAssets, setProcessedNumAssets] = useState(0);
  const [processedAddresses, setProcessedAddresses] = useState(0);
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
      await timeout(300);
      const unitAddresses = await blockchainProvider.fetchAssetAddresses(unit);
      if (unitAddresses.length == 1) {
        const address = unitAddresses[0].address;
        if (!(address in addressesUnits)) {
          addressesUnits[address] = {
            assets: [],
          };
        }
        addressesUnits[address].assets.push(unit);
      }
      setProcessedNumAssets(i);

      if (i > 9) {
        break;
      }
    }

    // setAddressesAssets(addressesUnits);
    setStage(stages.gottenAddresses);

    await getStakeAddresses(addressesUnits);
  }

  async function getStakeAddresses(addressesUnits) {
    setStage(stages.gettingStakeAddresses);

    let stakeAddresses = {};
    let counter = 0;
    for (let address in addressesUnits) {
      const stakeAddress = resolveRewardAddress(address);
      if (!(stakeAddress in stakeAddresses)) {
        stakeAddresses[stakeAddress] = {
          addresses: [],
          assets: [],
          amountReward: 0,
        };
      }

      stakeAddresses[stakeAddress].addresses.push(address);
      stakeAddresses[stakeAddress].assets.push(
        ...addressesUnits[address].assets
      );

      let amountPay = stakeAddresses[stakeAddress].assets.length * payPerNFT;
      let bonus =
        Math.floor(stakeAddresses[stakeAddress].assets.length / 4) *
        bonusPerNFTSet;
      stakeAddresses[stakeAddress].amountReward = amountPay + bonus;

      counter += 1;
      setProcessedAddresses(counter);
    }

    console.log('stakeAddresses', stakeAddresses);
    setAddressesAssets(stakeAddresses);

    setStage(stages.gottenStakeAddresses);
  }

  async function createTx() {
    setStage(stages.createTransaction);
    const tx = new Transaction({ initiator: wallet });
    for (let stakeAddress in addressesAssets) {
      const addressAssets = addressesAssets[stakeAddress];
      const address = addressAssets.addresses[0];
      tx.sendLovelace(address, addressAssets.amountReward.toString());
    }

    const unsignedTx = await tx.build();
    const signedTx = await wallet.signTx(unsignedTx);
    const txHash = await wallet.submitTx(signedTx);
    setTxHash(txHash);
    setStage(stages.transactionComplete);
  }

  function timeout(delay: number) {
    return new Promise((res) => setTimeout(res, delay));
  }

  return (
    <>
      <section className="bg-white dark:bg-gray-900">
        <div className="py-8 px-4 mx-auto max-w-screen-xl sm:py-16 lg:px-6">
          {stage == stages.init && (
            <Button onClick={() => getHolders()}>Get Holders</Button>
          )}

          {/* <p>Stage: {stage}</p> */}

          {stage == stages.gettingAddresses && (
            <p>Num. assets found: {numAssetsFound}</p>
          )}

          {processednumAssets > 0 && (
            <p>Num. assets processed: {processednumAssets}</p>
          )}

          {processedAddresses > 0 && (
            <p>Num. addresses processed: {processedAddresses}</p>
          )}

          {Object.keys(addressesAssets).length > 0 && (
            <>
              <p>Addresses and its assets:</p>
              <Codeblock data={addressesAssets} isJson={true} />
            </>
          )}

          {stage == stages.gottenStakeAddresses && (
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
          {stage == stages.gottenStakeAddresses && (
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
