import type { NextPage } from 'next';
import Link from 'next/link';
import GuidesLayout from '../../components/pages/guides/layout';
import Codeblock from '../../components/ui/codeblock';
import { Element } from 'react-scroll';
import Metatags from '../../components/site/metatags';
import { CardanoWallet, useWallet } from '@meshsdk/react';
import { BlockfrostProvider } from '@meshsdk/core';
import {
  Transaction,
  resolvePaymentKeyHash,
  resolvePlutusScriptAddress,
  resolveDataHash,
} from '@meshsdk/core';
import type { Data, PlutusScript } from '@meshsdk/core';
import { useEffect, useState } from 'react';
import Button from '../../components/ui/button';
import RunDemoResult from '../../components/common/runDemoResult';
import mintMeshToken from '../../components/common/mintMeshToken';
import ShowMoreDetails from '../../components/common/showMoreDetails';
import useLocalStorage from '../../hooks/useLocalStorage';

const policyId = 'd9312da562da182b02322fd8acb536f37eb9d29fba7c49dc17255527';
const assetId = '4d657368546f6b656e';
const price = 10000000;

const GuideSmartContractTransactionsPage: NextPage = () => {
  const sidebarItems = [
    { label: 'Initialize the Marketplace', to: 'init' },
    { label: 'Listing asset for sale', to: 'listasset' },
    { label: 'Cancel the listing', to: 'cancelListing' },
    { label: 'Purchase the listed asset', to: 'purchaseAsset' },
    { label: 'Update listing', to: 'updateListing' },
  ];

  return (
    <>
      <Metatags
        title="Build your NFT marketplace"
        description="Whether you are building a marketplace for your business or for your clients, we have you covered. Get started in minutes."
        image="/guides/custom-marketplace.png"
      />
      <GuidesLayout
        title="Build your NFT marketplace"
        desc="Whether you are building a marketplace for your business or for your clients, we have you covered. Get started in minutes."
        sidebarItems={sidebarItems}
        image="/guides/supermarket-g42acef7c1_640.jpg"
      >
        <IntroSection />
        <Init />
        <ListAsset />
        <CancelListing />
        <PurchaseListing />
        <UpdateListing />
      </GuidesLayout>
    </>
  );
};

function IntroSection() {
  const { wallet, connected } = useWallet();
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);

  return (
    <>
      <p>
        In this guide, we will build a marketplace where users can list their
        assets for sale and purchase the listed assets. The contract is written
        in Haskell, and it is open-source and available on{' '}
        <a
          href="https://github.com/MeshJS/mesh.plutus/tree/marketplace"
          target="_blank"
          rel="noreferrer"
        >
          GitHub
        </a>
        .
      </p>
      <p>
        If you would like to try out the demo in this guide, you can mint a Mesh
        token which we will be using it for listing on this marketplace demo.
        Connect your wallet and mint the token on preprod/preview testnet.
      </p>

      {connected ? (
        <>
          <Button
            onClick={() => mintMeshToken({ setLoading, setResponse, wallet })}
            style={
              loading ? 'warning' : response !== null ? 'success' : 'light'
            }
            disabled={loading}
          >
            Mint Mesh Token
          </Button>
          {response !== null && (
            <>
              <p>Mesh token minted successful.</p>
              <RunDemoResult response={response} label="Transaction hash" />
            </>
          )}
        </>
      ) : (
        <CardanoWallet />
      )}

      <p>
        If you have the Mesh token, we can list it on the marketplace in this
        demo.
      </p>
    </>
  );
}

function Init() {
  return (
    <>
      <Element name="init">
        <h2>Initialize the Plutus script</h2>
        <p>
          The first step is to initialize the Plutus script. The compiled plutus
          smart contract script CBOR is:
        </p>
        <Codeblock
          data={`const scriptCbor = '${scriptCbor}';`}
          isJson={false}
        />
        <p>The Plutus script is initialized with the following code:</p>
        <Codeblock
          data={`const script: PlutusScript = {\n  code: scriptCbor,\n  version: 'V2',\n};`}
          isJson={false}
        />
        <p>
          Let's say we are testing our marketplace implementation on{' '}
          <code>proprod</code>, we can resolve the Plutus script address with{' '}
          <code>resolvePlutusScriptAddress</code> where we input the{' '}
          <code>PlutusScript</code> and define the <code>network</code> (in our
          demo we use <code>0</code> for testnet):
        </p>
        <Codeblock
          data={`const scriptAddress = resolvePlutusScriptAddress(script, 0);`}
          isJson={false}
        />
      </Element>
    </>
  );
}

function ListAsset() {
  let code = ``;
  code += `const addr = (await wallet.getUsedAddresses())[0];\n\n`;
  code += `const datumConstr: Data = {\n`;
  code += `  alternative: 0,\n`;
  code += `  fields: [\n`;
  code += `    resolvePaymentKeyHash(addr),\n`;
  code += `    listPriceInLovelace,\n`;
  code += `    policyId,\n`;
  code += `    assetId,\n`;
  code += `  ],\n`;
  code += `};\n\n`;
  code += `const tx = new Transaction({ initiator: wallet })\n`;
  code += `.sendAssets(\n`;
  code += `  {\n`;
  code += `    address: scriptAddress,\n`;
  code += `    datum: {\n`;
  code += `      value: datumConstr,\n`;
  code += `    },\n`;
  code += `  },\n`;
  code += `  [\n`;
  code += `    {\n`;
  code += `      unit: policyId + assetId,\n`;
  code += `      quantity: '1',\n`;
  code += `    },\n`;
  code += `  ]\n`;
  code += `);\n\n`;
  code += `const unsignedTx = await tx.build();\n`;
  code += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  code += `const txHash = await wallet.submitTx(signedTx);\n`;

  let codeDatum = ``;
  codeDatum += `const datumConstr: Data = {\n`;
  codeDatum += `  alternative: 0,\n`;
  codeDatum += `  fields: [\n`;
  codeDatum += `    resolvePaymentKeyHash(addr), // seller address as pubkeyhash\n`;
  codeDatum += `    listPriceInLovelace, // price\n`;
  codeDatum += `    policyId, // policy ID of token\n`;
  codeDatum += `    assetId, // asset name of token in hex\n`;
  codeDatum += `  ],\n`;
  codeDatum += `};\n`;

  let codeAddress = `const addr = (await wallet.getUsedAddresses())[0];`;

  let codeTransaction = ``;
  codeTransaction += `const tx = new Transaction({ initiator: wallet })\n`;
  codeTransaction += `.sendAssets(\n`;
  codeTransaction += `  {\n`;
  codeTransaction += `    address: scriptAddress,\n`;
  codeTransaction += `    datum: {\n`;
  codeTransaction += `      value: datumConstr,\n`;
  codeTransaction += `    },\n`;
  codeTransaction += `  },\n`;
  codeTransaction += `  [\n`;
  codeTransaction += `    {\n`;
  codeTransaction += `      unit: policyId + assetId,\n`;
  codeTransaction += `      quantity: '1',\n`;
  codeTransaction += `    },\n`;
  codeTransaction += `  ]\n`;
  codeTransaction += `);\n\n`;
  codeTransaction += `const unsignedTx = await tx.build();\n`;
  codeTransaction += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  codeTransaction += `const txHash = await wallet.submitTx(signedTx);\n`;

  //

  const { wallet, connected } = useWallet();
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);
  const [userLocalStorage, setUserlocalStorage] = useLocalStorage(
    'meshMarketplaceDemo',
    {}
  );

  const blockchainProvider = new BlockfrostProvider(
    process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_PREPROD!
  );

  const { listAsset } = useMarketplacePlutus({
    blockchainFetcher: blockchainProvider,
    network: 0,
  });

  async function doListAsset() {
    setLoading(true);
    setResponse(null);

    try {
      const address = (await wallet.getUsedAddresses())[0];

      const txHash = await listAsset({
        policyId: policyId,
        assetId: assetId,
        listPriceInLovelace: price,
        quantity: '1',
      });
      setUserlocalStorage({
        sellerAddress: address,
        listPrice: price,
      });
      setResponse(txHash);
    } catch (error) {
      setResponse(`${error}`);
    }
    setLoading(false);
  }

  return (
    <Element name="listasset">
      <h2>Listing Asset for Sale</h2>

      <p>
        Firstly, we get the user's wallet address, this address is the seller's
        address. We can acquired the first wallet's address from the connected
        wallet with <code>getUsedAddresses()</code>:
      </p>
      <Codeblock data={codeAddress} isJson={false} />
      <p>Then, we create the datum that has the following schema:</p>
      <Codeblock data={codeDatum} isJson={false} />
      <p>
        Lastly, we create a transaction that uses <code>sendAssets()</code>, to
        send the asset for sale to the script address with the datum we have
        defined. <code>policyId + assetId</code> is the asset name in hex. We
        build the transaction, the seller sign the transaction and submit the
        transaction to the blockchain.
      </p>
      <Codeblock data={codeTransaction} isJson={false} />

      <p>Give the demo a try!</p>

      {connected ? (
        <>
          <Button
            onClick={() => doListAsset()}
            style={
              loading ? 'warning' : response !== null ? 'success' : 'light'
            }
            disabled={loading}
          >
            List Mesh Token
          </Button>
          {response !== null && (
            <>
              <p>Asset listed successful.</p>
              <RunDemoResult response={response} label="Transaction hash" />
            </>
          )}
        </>
      ) : (
        <CardanoWallet />
      )}

      <p>
        Now implement your own marketplace. Note: you may need a database to
        store the listing information.
      </p>

      <ShowMoreDetails label="Show full code on how to list an asset for sale">
        <Codeblock data={code} isJson={false} />
      </ShowMoreDetails>
    </Element>
  );
}

function CancelListing() {
  let codeDatum = ``;
  codeDatum += `const datumConstr: Data = {\n`;
  codeDatum += `  alternative: 0,\n`;
  codeDatum += `  fields: [\n`;
  codeDatum += `    resolvePaymentKeyHash(addr), // seller address as pubkeyhash\n`;
  codeDatum += `    listPriceInLovelace, // price\n`;
  codeDatum += `    policyId, // policy ID of token\n`;
  codeDatum += `    assetId, // asset name of token in hex\n`;
  codeDatum += `  ],\n`;
  codeDatum += `};\n`;

  let codegetAssetUtxo = ``;
  codegetAssetUtxo += `async function _getAssetUtxo({ scriptAddress, asset, datum }) {\n`;
  codegetAssetUtxo += `  const utxos = await blockchainFetcher.fetchAddressUTxOs(\n`;
  codegetAssetUtxo += `    scriptAddress,\n`;
  codegetAssetUtxo += `    asset\n`;
  codegetAssetUtxo += `  );\n`;
  codegetAssetUtxo += `  if (utxos.length == 0) {\n`;
  codegetAssetUtxo += `    throw 'No listing found.';\n`;
  codegetAssetUtxo += `  }\n`;
  codegetAssetUtxo += `  const dataHash = resolveDataHash(datum);\n`;
  codegetAssetUtxo += `  let utxo = utxos.find((utxo: any) => {\n`;
  codegetAssetUtxo += `    return utxo.output.dataHash == dataHash;\n`;
  codegetAssetUtxo += `  });\n`;
  codegetAssetUtxo += `  return utxo;\n`;
  codegetAssetUtxo += `}\n`;

  let codeRedeemer = `const redeemer = { data: { alternative: 1, fields: [] } };\n`;

  let codeTransaction = '';
  codeTransaction += `const tx = new Transaction({ initiator: wallet })\n`;
  codeTransaction += `  .redeemValue({\n`;
  codeTransaction += `    value: assetUtxo,\n`;
  codeTransaction += `    script: script,\n`;
  codeTransaction += `    datum: datumConstr,\n`;
  codeTransaction += `    redeemer: redeemer,\n`;
  codeTransaction += `  })\n`;
  codeTransaction += `  .sendValue(addr, assetUtxo)\n`;
  codeTransaction += `  .setRequiredSigners([addr]);\n`;
  codeTransaction += `\n`;
  codeTransaction += `const unsignedTx = await tx.build();\n`;
  codeTransaction += `const signedTx = await wallet.signTx(unsignedTx, true);\n`;
  codeTransaction += `const txHash = await wallet.submitTx(signedTx);\n`;

  let code = ``;
  code += `const addr = (await wallet.getUsedAddresses())[0];\n`;
  code += `\n`;
  code += `const datumConstr: Data = {\n`;
  code += `  alternative: 0,\n`;
  code += `  fields: [\n`;
  code += `    resolvePaymentKeyHash(addr),\n`;
  code += `    listPriceInLovelace,\n`;
  code += `    policyId,\n`;
  code += `    assetId,\n`;
  code += `  ],\n`;
  code += `};\n`;
  code += `\n`;
  code += `const assetUtxo = await _getAssetUtxo({\n`;
  code += `  scriptAddress: scriptAddress,\n`;
  code += `  asset: '${policyId}${assetId}',\n`;
  code += `  datum: datumConstr,\n`;
  code += `});\n`;
  code += `\n`;
  code += `if (assetUtxo === undefined) {\n`;
  code += `  throw 'No listing found.';\n`;
  code += `}\n`;
  code += `\n`;
  code += `const redeemer = { data: { alternative: 1, fields: [] } };\n`;
  code += `\n`;
  code += `const tx = new Transaction({ initiator: wallet })\n`;
  code += `  .redeemValue({\n`;
  code += `    value: assetUtxo,\n`;
  code += `    script: script,\n`;
  code += `    datum: datumConstr,\n`;
  code += `    redeemer: redeemer,\n`;
  code += `  })\n`;
  code += `  .sendValue(addr, assetUtxo)\n`;
  code += `  .setRequiredSigners([addr]);\n`;
  code += `\n`;
  code += `const unsignedTx = await tx.build();\n`;
  code += `const signedTx = await wallet.signTx(unsignedTx, true);\n`;
  code += `const txHash = await wallet.submitTx(signedTx);\n`;

  //

  const { connected } = useWallet();
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);

  const blockchainProvider = new BlockfrostProvider(
    process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_PREPROD!
  );

  const { cancelListing } = useMarketplacePlutus({
    blockchainFetcher: blockchainProvider,
    network: 0,
  });

  async function doCancelListing() {
    setLoading(true);
    setResponse(null);

    try {
      const txHash = await cancelListing({
        policyId: policyId,
        assetId: assetId,
        listPriceInLovelace: price,
      });
      setResponse(txHash);
    } catch (error) {
      setResponse(`${error}`);
    }
    setLoading(false);
  }

  return (
    <Element name="cancelListing">
      <h2>Cancel the Listing</h2>

      <p>
        Next, we will learn how to cancel the listing. Only the seller of the
        NFT can cancel the listing, thus we will define the datum with the
        following information:
      </p>

      <Codeblock data={codeDatum} isJson={false} />

      <p>
        For cancel, update and purchase endpoints, we need the UTxO in the
        script address as inputs to create the transaction. We use{' '}
        <code>fetchAddressUTxOs()</code> from one of the{' '}
        <Link href="/providers">providers</Link> to query for UTxO that contain
        the asset of our interest. Next, we filter the UTxO list by the datum
        hash, which we can get from the datum with{' '}
        <code>resolveDataHash()</code> (see{' '}
        <Link href="/apis/resolvers">resolvers</Link>). Here is the
        implementation for <code>_getAssetUtxo()</code>, to get the UTxO in the
        script address, asset, and use the datum hash to filter the correct UTxO
        for the transaction:
      </p>

      <Codeblock data={codegetAssetUtxo} isJson={false} />

      <p>Next, we define the redeemer for cancel listing:</p>

      <Codeblock data={codeRedeemer} isJson={false} />

      <p>
        Finally, we can build the transaction with the following code. We use
        the <code>redeemValue()</code> method to redeem the UTxO in the script
        address, and send the value back to the seller's address. We also need
        to set the required signers to the seller's address.
      </p>

      <Codeblock data={codeTransaction} isJson={false} />

      <p>
        Give the demo a try! Try cancelling the listing and get your NFT back if
        you have listed one.
      </p>

      {connected ? (
        <>
          <Button
            onClick={() => doCancelListing()}
            style={
              loading ? 'warning' : response !== null ? 'success' : 'light'
            }
            disabled={loading}
          >
            Cancel listing
          </Button>
          {response !== null && (
            <>
              <p>Listing cancelled successful.</p>
              <RunDemoResult response={response} label="Transaction hash" />
            </>
          )}
        </>
      ) : (
        <CardanoWallet />
      )}

      <ShowMoreDetails label="Show full code for cancelling a listing">
        <Codeblock data={code} isJson={false} />
      </ShowMoreDetails>
    </Element>
  );
}

function PurchaseListing() {
  let codeAddress =
    "const addr = (await wallet.getUsedAddresses())[0]; // buyer's address";

  let codeDatum = ``;
  codeDatum += `const datumConstr: Data = {\n`;
  codeDatum += `  alternative: 0,\n`;
  codeDatum += `  fields: [\n`;
  codeDatum += `    resolvePaymentKeyHash(sellerAddr), // seller address as pubkeyhash\n`;
  codeDatum += `    listPriceInLovelace, // price\n`;
  codeDatum += `    policyId, // policy ID of token\n`;
  codeDatum += `    assetId, // asset name of token in hex\n`;
  codeDatum += `  ],\n`;
  codeDatum += `};\n`;

  let codeRedeemer = `const redeemer = { data: { alternative: 0, fields: [] } };\n`;

  let codeTransaction = '';
  codeTransaction += `const tx = new Transaction({ initiator: wallet })\n`;
  codeTransaction += `  .redeemValue({\n`;
  codeTransaction += `    value: assetUtxo,\n`;
  codeTransaction += `    script: script,\n`;
  codeTransaction += `    datum: datumConstr,\n`;
  codeTransaction += `    redeemer: redeemer,\n`;
  codeTransaction += `  })\n`;
  codeTransaction += `  .sendValue(addr, assetUtxo)\n`;
  codeTransaction += `  .sendLovelace(sellerAddr, listPriceInLovelace.toString())\n`;
  codeTransaction += `  .setRequiredSigners([addr]);\n`;
  codeTransaction += `\n`;
  codeTransaction += `const unsignedTx = await tx.build();\n`;
  codeTransaction += `const signedTx = await wallet.signTx(unsignedTx, true);\n`;
  codeTransaction += `const txHash = await wallet.submitTx(signedTx);\n`;

  let code = ``;
  code += `const addr = (await wallet.getUsedAddresses())[0]; // buyer's address\n`;
  code += `\n`;
  code += `const datumConstr: Data = {\n`;
  code += `  alternative: 0,\n`;
  code += `  fields: [\n`;
  code += `    resolvePaymentKeyHash(sellerAddr),\n`;
  code += `    listPriceInLovelace,\n`;
  code += `    policyId,\n`;
  code += `    assetId,\n`;
  code += `  ],\n`;
  code += `};\n`;
  code += `\n`;
  code += `const assetUtxo = await _getAssetUtxo({\n`;
  code += `  scriptAddress: scriptAddress,\n`;
  code += `  asset: '${policyId}${assetId}',\n`;
  code += `  datum: datumConstr,\n`;
  code += `});\n`;
  code += `\n`;
  code += `const redeemer = { data: { alternative: 0, fields: [] } };\n`;
  code += `\n`;
  code += `const tx = new Transaction({ initiator: wallet })\n`;
  code += `  .redeemValue({\n`;
  code += `    value: assetUtxo,\n`;
  code += `    script: script,\n`;
  code += `    datum: datumConstr,\n`;
  code += `    redeemer: redeemer,\n`;
  code += `  })\n`;
  code += `  .sendValue(addr, assetUtxo)\n`;
  code += `  .sendLovelace(sellerAddr, listPriceInLovelace.toString())\n`;
  code += `  .setRequiredSigners([addr]);\n`;
  code += `\n`;
  code += `const unsignedTx = await tx.build();\n`;
  code += `const signedTx = await wallet.signTx(unsignedTx, true);\n`;
  code += `const txHash = await wallet.submitTx(signedTx);\n`;

  //

  const { connected } = useWallet();
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);
  const [userLocalStorage, setUserlocalStorage] = useLocalStorage(
    'meshMarketplaceDemo',
    {}
  );

  const blockchainProvider = new BlockfrostProvider(
    process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_PREPROD!
  );

  const { buyAsset } = useMarketplacePlutus({
    blockchainFetcher: blockchainProvider,
    network: 0,
  });

  async function doPurchase() {
    setLoading(true);
    setResponse(null);

    try {
      const txHash = await buyAsset({
        policyId: policyId,
        assetId: assetId,
        listPriceInLovelace: price,
        sellerAddr: userLocalStorage.sellerAddress,
      });
      setResponse(txHash);
    } catch (error) {
      setResponse(`${error}`);
    }
    setLoading(false);
  }

  return (
    <Element name="purchaseAsset">
      <h2>Purchase the Listed Asset</h2>

      <p>
        A key feature of a marketplace is the ability to purchase the listed
        asset from the seller. The purchase endpoint will take the asset, the
        price and the seller address as parameters. These parameters will be
        used to create the datum for the validator. With a successful purchase
        will transfer the asset to the buyer and the listed price to the seller.
      </p>

      <p>First, we need the buyer's address to send the asset to:</p>

      <Codeblock data={codeAddress} isJson={false} />

      <p>
        Like the cancel endpoint, we need to create the datum for the validator:
      </p>

      <Codeblock data={codeDatum} isJson={false} />

      <p>Then, we will define the redeemer:</p>

      <Codeblock data={codeRedeemer} isJson={false} />

      <p>
        Finally, we can build the transaction and submit it to the blockchain.
        We will use the <code>redeemValue()</code> method to redeem the asset
        from the validator, use <code>sendValue()</code> to send the asset to
        the buyer and <code>sendLovelace()</code> to send the payment price to
        the seller:
      </p>

      <Codeblock data={codeTransaction} isJson={false} />

      <p>
        Give the demo a try! Try purchasing the NFT by connecting another
        wallet.
      </p>

      {connected ? (
        <>
          <Button
            onClick={() => doPurchase()}
            style={
              loading ? 'warning' : response !== null ? 'success' : 'light'
            }
            disabled={loading}
          >
            Purchase NFT
          </Button>
          {response !== null && (
            <>
              <p>Purchase successful.</p>
              <RunDemoResult response={response} label="Transaction hash" />
            </>
          )}
        </>
      ) : (
        <CardanoWallet />
      )}

      <ShowMoreDetails label="Show full code for purchasing an asset">
        <Codeblock data={code} isJson={false} />
      </ShowMoreDetails>
    </Element>
  );
}

function UpdateListing() {
  let codeDatum = ``;
  codeDatum += `const datumConstr: Data = {\n`;
  codeDatum += `  alternative: 0,\n`;
  codeDatum += `  fields: [\n`;
  codeDatum += `    resolvePaymentKeyHash(addr), // seller address as pubkeyhash\n`;
  codeDatum += `    listPriceInLovelace, // listed price\n`;
  codeDatum += `    policyId, // policy ID of token\n`;
  codeDatum += `    assetId, // asset name of token in hex\n`;
  codeDatum += `  ],\n`;
  codeDatum += `};\n`;

  let codeDatumNew = '';
  codeDatumNew += `const datumConstrNew: Data = {\n`;
  codeDatumNew += `  alternative: 0,\n`;
  codeDatumNew += `  fields: [\n`;
  codeDatumNew += `    resolvePaymentKeyHash(addr), // seller address as pubkeyhash\n`;
  codeDatumNew += `    updatedPriceInLovelace, // updated price\n`;
  codeDatumNew += `    policyId, // policy ID of token\n`;
  codeDatumNew += `    assetId, // asset name of token in hex\n`;
  codeDatumNew += `  ],\n`;
  codeDatumNew += `};\n`;

  let codeRedeemer = `const redeemer = { data: { alternative: 1, fields: [] } };\n`;

  let codeTransaction = '';
  codeTransaction += `const tx = new Transaction({ initiator: wallet })\n`;
  codeTransaction += `  .redeemValue({\n`;
  codeTransaction += `    value: assetUtxo,\n`;
  codeTransaction += `    script: script,\n`;
  codeTransaction += `    datum: datumConstr,\n`;
  codeTransaction += `    redeemer: redeemer,\n`;
  codeTransaction += `  })\n`;
  codeTransaction += `  .setRequiredSigners([addr])\n`;
  codeTransaction += `  .sendAssets(\n`;
  codeTransaction += `    {\n`;
  codeTransaction += `      address: scriptAddress,\n`;
  codeTransaction += `      datum: {\n`;
  codeTransaction += `        value: datumConstrNew,\n`;
  codeTransaction += `      },\n`;
  codeTransaction += `    },\n`;
  codeTransaction += `    [\n`;
  codeTransaction += `      {\n`;
  codeTransaction += `        unit: '${policyId}${assetId}',\n`;
  codeTransaction += `        quantity: '1',\n`;
  codeTransaction += `      },\n`;
  codeTransaction += `    ]\n`;
  codeTransaction += `  );\n`;
  codeTransaction += `\n`;
  codeTransaction += `const unsignedTx = await tx.build();\n`;
  codeTransaction += `const signedTx = await wallet.signTx(unsignedTx, true);\n`;
  codeTransaction += `const txHash = await wallet.submitTx(signedTx);\n`;

  let code = ``;
  code += `const addr = (await wallet.getUsedAddresses())[0];\n`;
  code += `\n`;
  code += `const datumConstr: Data = {\n`;
  code += `  alternative: 0,\n`;
  code += `  fields: [\n`;
  code += `    resolvePaymentKeyHash(addr),\n`;
  code += `    listPriceInLovelace,\n`;
  code += `    policyId,\n`;
  code += `    assetId,\n`;
  code += `  ],\n`;
  code += `};\n`;
  code += `\n`;
  code += `const datumConstrNew: Data = {\n`;
  code += `  alternative: 0,\n`;
  code += `  fields: [\n`;
  code += `    resolvePaymentKeyHash(addr),\n`;
  code += `    updatedPriceInLovelace,\n`;
  code += `    policyId,\n`;
  code += `    assetId,\n`;
  code += `  ],\n`;
  code += `};\n`;
  code += `\n`;
  code += `const assetUtxo = await _getAssetUtxo({\n`;
  code += `  scriptAddress: scriptAddress,\n`;
  code += `  asset: '${policyId}${assetId}',\n`;
  code += `  datum: datumConstr,\n`;
  code += `});\n`;
  code += `\n`;
  code += `const redeemer = { data: { alternative: 1, fields: [] } };\n`;
  code += `\n`;
  code += `const tx = new Transaction({ initiator: wallet })\n`;
  code += `  .redeemValue({\n`;
  code += `    value: assetUtxo,\n`;
  code += `    script: script,\n`;
  code += `    datum: datumConstr,\n`;
  code += `    redeemer: redeemer,\n`;
  code += `  })\n`;
  code += `  .setRequiredSigners([addr])\n`;
  code += `  .sendAssets(\n`;
  code += `    {\n`;
  code += `      address: scriptAddress,\n`;
  code += `      datum: {\n`;
  code += `        value: datumConstrNew,\n`;
  code += `      },\n`;
  code += `    },\n`;
  code += `    [\n`;
  code += `      {\n`;
  code += `        unit: '${policyId}${assetId}',\n`;
  code += `        quantity: '1',\n`;
  code += `      },\n`;
  code += `    ]\n`;
  code += `  );\n`;
  code += `\n`;
  code += `const unsignedTx = await tx.build();\n`;
  code += `const signedTx = await wallet.signTx(unsignedTx, true);\n`;
  code += `const txHash = await wallet.submitTx(signedTx);\n`;

  //

  const { connected } = useWallet();
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);

  const blockchainProvider = new BlockfrostProvider(
    process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_PREPROD!
  );

  const { updateListing } = useMarketplacePlutus({
    blockchainFetcher: blockchainProvider,
    network: 0,
  });

  async function doUpdatelListing() {
    setLoading(true);
    setResponse(null);

    try {
      const txHash = await updateListing({
        policyId: policyId,
        assetId: assetId,
        listPriceInLovelace: price,
        quantity: '1',
        updatedPriceInLovelace: price,
      });
      setResponse(txHash);
    } catch (error) {
      setResponse(`${error}`);
    }
    setLoading(false);
  }

  return (
    <Element name="updateListing">
      <h2>Update the Listing</h2>

      <p>
        Finally, we will learn how to update the listing. Only the seller of the
        NFT can update the listing, thus we will define the datum with the
        following information:
      </p>

      <Codeblock data={codeDatum} isJson={false} />

      <p>We will also need to create the updated datum with the new price:</p>

      <Codeblock data={codeDatumNew} isJson={false} />

      <p>Next, we define the redeemer for updating the listing:</p>

      <Codeblock data={codeRedeemer} isJson={false} />

      <p>
        Finally, we can build the transaction to update the listing. We use the{' '}
        <code>redeemValue()</code> method to redeem the UTxO in the script
        address with the original datum, and then we use the{' '}
        <code>sendAssets()</code> method to send the NFT to the same script
        address, with the new datum.
      </p>

      <Codeblock data={codeTransaction} isJson={false} />

      <p>
        Give the demo a try! Try updating the listing. Just simplicity for this
        demo, we will update the price to the same price, but in a real
        application, you would update the price to a new price.
      </p>

      {connected ? (
        <>
          <Button
            onClick={() => doUpdatelListing()}
            style={
              loading ? 'warning' : response !== null ? 'success' : 'light'
            }
            disabled={loading}
          >
            Update listing
          </Button>
          {response !== null && (
            <>
              <p>Listing updated successful.</p>
              <RunDemoResult response={response} label="Transaction hash" />
            </>
          )}
        </>
      ) : (
        <CardanoWallet />
      )}

      <ShowMoreDetails label="Show full code for updating the listing">
        <Codeblock data={code} isJson={false} />
      </ShowMoreDetails>
    </Element>
  );
}

/////////

export default GuideSmartContractTransactionsPage;

export const scriptCbor =
  '590d74590d7101000033232323232323232323232323233223232323232223232323223223232533533300b3333573466e1cd55cea804a400046666444424666600200a0080060046eb8d5d0a8049bad35742a0106eb8d5d0a8039bae357426ae89401c8c98c8078cd5ce00f80f00e1999ab9a3370ea0089001109100091999ab9a3370ea00a9000109100111931900f99ab9c02001f01d01c3333573466e1cd55cea80124000466442466002006004646464646464646464646464646666ae68cdc39aab9d500c480008cccccccccccc88888888888848cccccccccccc00403403002c02802402001c01801401000c008cd406c070d5d0a80619a80d80e1aba1500b33501b01d35742a014666aa03eeb94078d5d0a804999aa80fbae501e35742a01066a03604c6ae85401cccd5407c09dd69aba150063232323333573466e1cd55cea801240004664424660020060046464646666ae68cdc39aab9d5002480008cc8848cc00400c008cd40c5d69aba150023032357426ae8940088c98c80d0cd5ce01a81a01909aab9e5001137540026ae854008c8c8c8cccd5cd19b8735573aa004900011991091980080180119a818bad35742a00460646ae84d5d1280111931901a19ab9c035034032135573ca00226ea8004d5d09aba2500223263203033573806206005c26aae7940044dd50009aba1500533501b75c6ae854010ccd5407c08c8004d5d0a801999aa80fbae200135742a004604a6ae84d5d1280111931901619ab9c02d02c02a135744a00226ae8940044d5d1280089aba25001135744a00226ae8940044d5d1280089aba25001135744a00226ae8940044d55cf280089baa00135742a004602a6ae84d5d1280111931900f19ab9c01f01e01c101d13263201d335738921035054350001d135573ca00226ea80044d55ce9baa001135744a00226ae8940044d55cf280089baa0011232230023758002640026aa028446666aae7c004940288cd4024c010d5d080118019aba2002014232323333573466e1cd55cea8012400046644246600200600460186ae854008c014d5d09aba2500223263201433573802a02802426aae7940044dd50009191919191999ab9a3370e6aae75401120002333322221233330010050040030023232323333573466e1cd55cea80124000466442466002006004602a6ae854008cd403c050d5d09aba2500223263201933573803403202e26aae7940044dd50009aba150043335500875ca00e6ae85400cc8c8c8cccd5cd19b875001480108c84888c008010d5d09aab9e500323333573466e1d4009200223212223001004375c6ae84d55cf280211999ab9a3370ea00690001091100191931900d99ab9c01c01b019018017135573aa00226ea8004d5d0a80119a805bae357426ae8940088c98c8054cd5ce00b00a80989aba25001135744a00226aae7940044dd5000899aa800bae75a224464460046eac004c8004d5404488c8cccd55cf80112804119a8039991091980080180118031aab9d5002300535573ca00460086ae8800c0484d5d080088910010910911980080200189119191999ab9a3370ea0029000119091180100198029aba135573ca00646666ae68cdc3a801240044244002464c6402066ae700440400380344d55cea80089baa001232323333573466e1d400520062321222230040053007357426aae79400c8cccd5cd19b875002480108c848888c008014c024d5d09aab9e500423333573466e1d400d20022321222230010053007357426aae7940148cccd5cd19b875004480008c848888c00c014dd71aba135573ca00c464c6402066ae7004404003803403002c4d55cea80089baa001232323333573466e1cd55cea80124000466442466002006004600a6ae854008dd69aba135744a004464c6401866ae700340300284d55cf280089baa0012323333573466e1cd55cea800a400046eb8d5d09aab9e500223263200a33573801601401026ea80048c8c8c8c8c8cccd5cd19b8750014803084888888800c8cccd5cd19b875002480288488888880108cccd5cd19b875003480208cc8848888888cc004024020dd71aba15005375a6ae84d5d1280291999ab9a3370ea00890031199109111111198010048041bae35742a00e6eb8d5d09aba2500723333573466e1d40152004233221222222233006009008300c35742a0126eb8d5d09aba2500923333573466e1d40192002232122222223007008300d357426aae79402c8cccd5cd19b875007480008c848888888c014020c038d5d09aab9e500c23263201333573802802602202001e01c01a01801626aae7540104d55cf280189aab9e5002135573ca00226ea80048c8c8c8c8cccd5cd19b875001480088ccc888488ccc00401401000cdd69aba15004375a6ae85400cdd69aba135744a00646666ae68cdc3a80124000464244600400660106ae84d55cf280311931900619ab9c00d00c00a009135573aa00626ae8940044d55cf280089baa001232323333573466e1d400520022321223001003375c6ae84d55cf280191999ab9a3370ea004900011909118010019bae357426aae7940108c98c8024cd5ce00500480380309aab9d50011375400224464646666ae68cdc3a800a40084244400246666ae68cdc3a8012400446424446006008600c6ae84d55cf280211999ab9a3370ea00690001091100111931900519ab9c00b00a008007006135573aa00226ea80048c8cccd5cd19b8750014800884880088cccd5cd19b8750024800084880048c98c8018cd5ce00380300200189aab9d37540029309000a48103505431001123230010012233003300200200132323232332232323233223232332232323232323232323232332232323222232533500313301c3301249010131003301a33300f3300550015335323500122222222222200450011622153350011002221635004222200235004222200148008cc070cc0492410132003232333573466e2000800407c080d4014888800cccc03ccc0154004c05801006c06ccc0492410133003301a32333355300c12001323350132233350110030010023500e00133501222230033002001200122337000029001000a4000664464600266aa60342400246a00244002646a002444444444444018a008640026aa04844a66a002200644264a66a64646a004446a006446466a00a466a0084a66a666ae68cdc78010008170168a80188169016919a80210169299a999ab9a3371e00400205c05a2a006205a2a66a00642a66a0044266a004466a004466a004466a0044660420040024060466a004406046604200400244406044466a0084060444a66a666ae68cdc38030018198190a99a999ab9a3370e00a00406606426605e0080022064206420562a66a002420562056664424660020060046424460020066aa66a6a014446a0044444444444446666a01a4a0564a0564a0564666aa604424002a04e46a00244a66aa66a666ae68cdc79a801110011a8021100101c01b8999ab9a3370e6a004440026a0084400207006e206e26a05e0062a05c01a426a002446a00244446a0084466a0044606493119aa8198008028981424c44004a0386a006444400826600e00600220026008002a030a03290010998092481013400323235002222222222222533533355301912001501e25335333573466e3c0380040b40b04d40900045408c010840b440acc05c014c04c0084c04800488ccd54c0104800488cd54c024480048d400488cd5408c008cd54c030480048d400488cd54098008ccd40048cc0952000001223302600200123302500148000004cd54c024480048d400488cd5408c008ccd40048cd54c034480048d400488cd5409c008d5403c00400488ccd5540280480080048cd54c034480048d400488cd5409c008d54038004004ccd5540140340080054058d4008888888888888ccd54c0404800488d40088888d401088cd400894cd4ccd5cd19b8f01600103002f133502a00600810082008502200a111222333553004120015015335530071200123500122335502100235500900133355300412001223500222533533355300c120013233501322333500322002002001350012200112330012253350021022100101f235001223300a002005006100313350190040035016001335530071200123500122323355022003300100532001355022225335001135500a003221350022253353300c002008112223300200a004130060030023200135501b2211222533500110022213300500233355300712001005004001112122230030041121222300100432001355018221122533500115013221335014300400233553006120010040013200135501722112225335001135006003221333500900530040023335530071200100500400112350012200112350012200222333573466e3c008004048044888c8c8c004014c8004d5405c88cd400520002235002225335333573466e3c0080240640604c01c0044c01800cc8004d5405888cd400520002235002225335333573466e3c00801c06005c40044c01800c4cd4004894cd40088400c4005401048848cc00400c008894cd400440384cd5ce00100691a80091001090911801001889100091a8009111002190009aa805910891299a8008a80311099a803980200119aa98030900080200088910010910911980080200191199ab9a3370e00400200c00a910100225335002100110031220021220012233700004002464c649319ab9c4901024c67001200111221233001003002112323001001223300330020020011';

export function useMarketplacePlutus({ blockchainFetcher, network = 0 }) {
  const { connected, wallet } = useWallet();
  const [scriptAddress, setScriptAddress] = useState('');
  const [script, setScript] = useState({});

  useEffect(() => {
    const _script: PlutusScript = {
      code: scriptCbor,
      version: 'V2',
    };
    setScript(_script);
    const _scriptAddress = resolvePlutusScriptAddress(_script, network);
    setScriptAddress(_scriptAddress);
  }, []);

  async function checkWallet() {
    if (!connected) {
      throw 'Wallet not connected';
    }
    const walletNetwork = await wallet.getNetworkId();
    if (walletNetwork !== network) {
      throw 'Wallet wrong network';
    }
  }

  async function _getAssetUtxo({ scriptAddress, asset, datum }) {
    const utxos = await blockchainFetcher.fetchAddressUTxOs(
      scriptAddress,
      asset
    );
    if (utxos.length == 0) {
      throw 'No listing found.';
    }
    const dataHash = resolveDataHash(datum);
    let utxo = utxos.find((utxo: any) => {
      return utxo.output.dataHash == dataHash;
    });
    return utxo;
  }

  async function listAsset({
    policyId,
    assetId,
    listPriceInLovelace,
    quantity,
  }: {
    policyId: string;
    assetId: string;
    listPriceInLovelace: number;
    quantity: number | string;
  }) {
    await checkWallet();

    const addr = (await wallet.getUsedAddresses())[0];
    const datumConstr: Data = {
      alternative: 0,
      fields: [
        resolvePaymentKeyHash(addr),
        listPriceInLovelace,
        policyId,
        assetId,
      ],
    };
    const tx = new Transaction({ initiator: wallet }).sendAssets(
      {
        address: scriptAddress,
        datum: {
          value: datumConstr,
        },
      },
      [
        {
          unit: `${policyId}${assetId}`,
          quantity: quantity.toString(),
        },
      ]
    );
    const unsignedTx = await tx.build();
    const signedTx = await wallet.signTx(unsignedTx);
    const txHash = await wallet.submitTx(signedTx);
    return txHash;
  }

  async function cancelListing({
    policyId,
    assetId,
    listPriceInLovelace,
  }: {
    policyId: string;
    assetId: string;
    listPriceInLovelace: number;
  }) {
    const addr = (await wallet.getUsedAddresses())[0];
    const datumConstr: Data = {
      alternative: 0,
      fields: [
        resolvePaymentKeyHash(addr),
        listPriceInLovelace,
        policyId,
        assetId,
      ],
    };

    if (wallet) {
      const assetUtxo = await _getAssetUtxo({
        scriptAddress: scriptAddress,
        asset: `${policyId}${assetId}`,
        datum: datumConstr,
      });

      if (assetUtxo === undefined) {
        throw 'No listing found.';
      }

      const redeemer = { data: { alternative: 1, fields: [] } };

      const tx = new Transaction({ initiator: wallet })
        .redeemValue({
          value: assetUtxo,
          script: script,
          datum: datumConstr,
          redeemer: redeemer,
        })
        .sendValue(addr, assetUtxo)
        .setRequiredSigners([addr]);

      const unsignedTx = await tx.build();
      const signedTx = await wallet.signTx(unsignedTx, true);
      const txHash = await wallet.submitTx(signedTx);

      return txHash;
    }
  }

  async function buyAsset({
    policyId,
    assetId,
    listPriceInLovelace,
    sellerAddr,
  }: {
    policyId: string;
    assetId: string;
    listPriceInLovelace: number;
    sellerAddr: string;
  }) {
    const addr = (await wallet.getUsedAddresses())[0]; // Buyer's address
    const datumConstr: Data = {
      alternative: 0,
      fields: [
        resolvePaymentKeyHash(sellerAddr),
        listPriceInLovelace,
        policyId,
        assetId,
      ],
    };

    if (wallet) {
      const assetUtxo = await _getAssetUtxo({
        scriptAddress: scriptAddress,
        asset: `${policyId}${assetId}`,
        datum: datumConstr,
      });

      const redeemer = { data: { alternative: 0, fields: [] } };

      const tx = new Transaction({ initiator: wallet })
        .redeemValue({
          value: assetUtxo,
          script: script,
          datum: datumConstr,
          redeemer: redeemer,
        })
        .sendValue(addr, assetUtxo)
        .sendLovelace(sellerAddr, listPriceInLovelace.toString())
        .setRequiredSigners([addr]);

      const unsignedTx = await tx.build();
      const signedTx = await wallet.signTx(unsignedTx, true);
      const txHash = await wallet.submitTx(signedTx);
      return txHash;
    }
  }

  async function updateListing({
    policyId,
    assetId,
    listPriceInLovelace,
    quantity,
    updatedPriceInLovelace,
  }: {
    policyId: string;
    assetId: string;
    listPriceInLovelace: number;
    quantity: number | string;
    updatedPriceInLovelace: number;
  }) {
    const addr = (await wallet.getUsedAddresses())[0];
    const datumConstr: Data = {
      alternative: 0,
      fields: [
        resolvePaymentKeyHash(addr),
        listPriceInLovelace,
        policyId,
        assetId,
      ],
    };
    const datumConstrNew: Data = {
      alternative: 0,
      fields: [
        resolvePaymentKeyHash(addr),
        updatedPriceInLovelace,
        policyId,
        assetId,
      ],
    };
    if (wallet) {
      const assetUtxo = await _getAssetUtxo({
        scriptAddress: scriptAddress,
        asset: `${policyId}${assetId}`,
        datum: datumConstr,
      });

      const redeemer = { data: { alternative: 1, fields: [] } };

      const tx = new Transaction({ initiator: wallet })
        .redeemValue({
          value: assetUtxo,
          script: script,
          datum: datumConstr,
          redeemer: redeemer,
        })
        .setRequiredSigners([addr])
        .sendAssets(
          {
            address: scriptAddress,
            datum: {
              value: datumConstrNew,
            },
          },
          [
            {
              unit: `${policyId}${assetId}`,
              quantity: quantity.toString(),
            },
          ]
        );

      const unsignedTx = await tx.build();
      const signedTx = await wallet.signTx(unsignedTx, true);
      const txHash = await wallet.submitTx(signedTx);
      return txHash;
    }
  }

  return { listAsset, buyAsset, updateListing, cancelListing };
}
