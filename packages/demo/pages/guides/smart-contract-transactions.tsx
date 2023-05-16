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
        title="Smart Contract Transactions with a Marketplace Contract"
        description="Build a marketplace with Plutus (Haskell), where users can list their assets for sale and purchase the listed assets."
        image="/guides/smart-contract-transactions.png"
      />
      <GuidesLayout
        title="Smart Contract Transactions with a Marketplace Contract"
        desc="Build a marketplace with Plutus (Haskell), where users can list their assets for sale and purchase the listed assets."
        sidebarItems={sidebarItems}
        image="/guides/supermarket-g42acef7c1_640.jpg"
      >
        <IntroSection />
        <Init />
        <ListAsset />
        <CancelListing />
        <PurchaseListing />
        <UpdateListing />
        <OutroSection />
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
        assets for sale and purchase the listed assets. The seller can update or
        cancel the listing at any time. The contract is written in Haskell, and it
        is open-source and available on{' '}
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
        token which we will use for listing on this marketplace demo.
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
        If you now have the Mesh token, we can list it on the marketplace in this
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
          <code>preprod</code>, we can resolve the Plutus script address with{' '}
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
        Firstly, we get the user's wallet address: this address is the seller's
        address. We can acquire the first wallet's address from the connected
        wallet with <code>getUsedAddresses()</code>:
      </p>
      <Codeblock data={codeAddress} isJson={false} />
      <p>Then, we create the datum that has the following schema:</p>
      <Codeblock data={codeDatum} isJson={false} />
      <p>
        Lastly, we create a transaction that uses <code>sendAssets()</code>, to
        send the asset for sale to the script address with the datum we have
        defined. <code>policyId + assetId</code> is the asset name in hex. We
        build the transaction, the seller signs the transaction and submits the
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
        <Link href="/providers">providers</Link> to query for UTxOs that contain
        the asset of our interest. Next, we filter the UTxO list by the datum
        hash, which we can get from the datum with{' '}
        <code>resolveDataHash()</code> (see{' '}
        <Link href="/apis/resolvers">resolvers</Link>). Here is the
        implementation for <code>_getAssetUtxo()</code>, to get the UTxO in the
        script address that consists of the listed asset, and we use the datum
        hash to filter and get the correct UTxO for the transaction's input:
      </p>

      <Codeblock data={codegetAssetUtxo} isJson={false} />

      <p>Next, we define the redeemer for cancelling the listing:</p>

      <Codeblock data={codeRedeemer} isJson={false} />

      <p>
        Finally, we can build the transaction with the following code. We use
        the <code>redeemValue()</code> method to redeem the UTxO in the script
        address, and send the value back to the seller's address. We also need
        to set the "required signers" to include just the seller's address.
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
        used to create the datum for the validator. A successful purchase
        will result in the transfer of the asset to the buyer and the listed price to the seller.
      </p>

      <p>First, we need the buyer's address to send the asset to:</p>

      <Codeblock data={codeAddress} isJson={false} />

      <p>
        Like the cancel endpoint, we need to create the datum for the validator.
        It is important to note that we are using the seller's address to create
        the datum:
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
        application you would update the price to a new price.
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

function OutroSection() {
  return (
    <>
      <p>
        And there you go! I hope this is a good starting point for you to start building
        your own apps that use smart contracts!
      </p>
    </>
  );
}

/////////

export default GuideSmartContractTransactionsPage;

// const scriptCbor = '590d74590d7101000033232323232323232323232323233223232323232223232323223223232533533300b3333573466e1cd55cea804a400046666444424666600200a0080060046eb8d5d0a8049bad35742a0106eb8d5d0a8039bae357426ae89401c8c98c8078cd5ce00f80f00e1999ab9a3370ea0089001109100091999ab9a3370ea00a9000109100111931900f99ab9c02001f01d01c3333573466e1cd55cea80124000466442466002006004646464646464646464646464646666ae68cdc39aab9d500c480008cccccccccccc88888888888848cccccccccccc00403403002c02802402001c01801401000c008cd406c070d5d0a80619a80d80e1aba1500b33501b01d35742a014666aa03eeb94078d5d0a804999aa80fbae501e35742a01066a03604c6ae85401cccd5407c09dd69aba150063232323333573466e1cd55cea801240004664424660020060046464646666ae68cdc39aab9d5002480008cc8848cc00400c008cd40c5d69aba150023032357426ae8940088c98c80d0cd5ce01a81a01909aab9e5001137540026ae854008c8c8c8cccd5cd19b8735573aa004900011991091980080180119a818bad35742a00460646ae84d5d1280111931901a19ab9c035034032135573ca00226ea8004d5d09aba2500223263203033573806206005c26aae7940044dd50009aba1500533501b75c6ae854010ccd5407c08c8004d5d0a801999aa80fbae200135742a004604a6ae84d5d1280111931901619ab9c02d02c02a135744a00226ae8940044d5d1280089aba25001135744a00226ae8940044d5d1280089aba25001135744a00226ae8940044d55cf280089baa00135742a004602a6ae84d5d1280111931900f19ab9c01f01e01c101d13263201d335738921035054350001d135573ca00226ea80044d55ce9baa001135744a00226ae8940044d55cf280089baa0011232230023758002640026aa028446666aae7c004940288cd4024c010d5d080118019aba2002014232323333573466e1cd55cea8012400046644246600200600460186ae854008c014d5d09aba2500223263201433573802a02802426aae7940044dd50009191919191999ab9a3370e6aae75401120002333322221233330010050040030023232323333573466e1cd55cea80124000466442466002006004602a6ae854008cd403c050d5d09aba2500223263201933573803403202e26aae7940044dd50009aba150043335500875ca00e6ae85400cc8c8c8cccd5cd19b875001480108c84888c008010d5d09aab9e500323333573466e1d4009200223212223001004375c6ae84d55cf280211999ab9a3370ea00690001091100191931900d99ab9c01c01b019018017135573aa00226ea8004d5d0a80119a805bae357426ae8940088c98c8054cd5ce00b00a80989aba25001135744a00226aae7940044dd5000899aa800bae75a224464460046eac004c8004d5404488c8cccd55cf80112804119a8039991091980080180118031aab9d5002300535573ca00460086ae8800c0484d5d080088910010910911980080200189119191999ab9a3370ea0029000119091180100198029aba135573ca00646666ae68cdc3a801240044244002464c6402066ae700440400380344d55cea80089baa001232323333573466e1d400520062321222230040053007357426aae79400c8cccd5cd19b875002480108c848888c008014c024d5d09aab9e500423333573466e1d400d20022321222230010053007357426aae7940148cccd5cd19b875004480008c848888c00c014dd71aba135573ca00c464c6402066ae7004404003803403002c4d55cea80089baa001232323333573466e1cd55cea80124000466442466002006004600a6ae854008dd69aba135744a004464c6401866ae700340300284d55cf280089baa0012323333573466e1cd55cea800a400046eb8d5d09aab9e500223263200a33573801601401026ea80048c8c8c8c8c8cccd5cd19b8750014803084888888800c8cccd5cd19b875002480288488888880108cccd5cd19b875003480208cc8848888888cc004024020dd71aba15005375a6ae84d5d1280291999ab9a3370ea00890031199109111111198010048041bae35742a00e6eb8d5d09aba2500723333573466e1d40152004233221222222233006009008300c35742a0126eb8d5d09aba2500923333573466e1d40192002232122222223007008300d357426aae79402c8cccd5cd19b875007480008c848888888c014020c038d5d09aab9e500c23263201333573802802602202001e01c01a01801626aae7540104d55cf280189aab9e5002135573ca00226ea80048c8c8c8c8cccd5cd19b875001480088ccc888488ccc00401401000cdd69aba15004375a6ae85400cdd69aba135744a00646666ae68cdc3a80124000464244600400660106ae84d55cf280311931900619ab9c00d00c00a009135573aa00626ae8940044d55cf280089baa001232323333573466e1d400520022321223001003375c6ae84d55cf280191999ab9a3370ea004900011909118010019bae357426aae7940108c98c8024cd5ce00500480380309aab9d50011375400224464646666ae68cdc3a800a40084244400246666ae68cdc3a8012400446424446006008600c6ae84d55cf280211999ab9a3370ea00690001091100111931900519ab9c00b00a008007006135573aa00226ea80048c8cccd5cd19b8750014800884880088cccd5cd19b8750024800084880048c98c8018cd5ce00380300200189aab9d37540029309000a48103505431001123230010012233003300200200132323232332232323233223232332232323232323232323232332232323222232533500313301c3301249010131003301a33300f3300550015335323500122222222222200450011622153350011002221635004222200235004222200148008cc070cc0492410132003232333573466e2000800407c080d4014888800cccc03ccc0154004c05801006c06ccc0492410133003301a32333355300c12001323350132233350110030010023500e00133501222230033002001200122337000029001000a4000664464600266aa60342400246a00244002646a002444444444444018a008640026aa04844a66a002200644264a66a64646a004446a006446466a00a466a0084a66a666ae68cdc78010008170168a80188169016919a80210169299a999ab9a3371e00400205c05a2a006205a2a66a00642a66a0044266a004466a004466a004466a0044660420040024060466a004406046604200400244406044466a0084060444a66a666ae68cdc38030018198190a99a999ab9a3370e00a00406606426605e0080022064206420562a66a002420562056664424660020060046424460020066aa66a6a014446a0044444444444446666a01a4a0564a0564a0564666aa604424002a04e46a00244a66aa66a666ae68cdc79a801110011a8021100101c01b8999ab9a3370e6a004440026a0084400207006e206e26a05e0062a05c01a426a002446a00244446a0084466a0044606493119aa8198008028981424c44004a0386a006444400826600e00600220026008002a030a03290010998092481013400323235002222222222222533533355301912001501e25335333573466e3c0380040b40b04d40900045408c010840b440acc05c014c04c0084c04800488ccd54c0104800488cd54c024480048d400488cd5408c008cd54c030480048d400488cd54098008ccd40048cc0952000001223302600200123302500148000004cd54c024480048d400488cd5408c008ccd40048cd54c034480048d400488cd5409c008d5403c00400488ccd5540280480080048cd54c034480048d400488cd5409c008d54038004004ccd5540140340080054058d4008888888888888ccd54c0404800488d40088888d401088cd400894cd4ccd5cd19b8f01600103002f133502a00600810082008502200a111222333553004120015015335530071200123500122335502100235500900133355300412001223500222533533355300c120013233501322333500322002002001350012200112330012253350021022100101f235001223300a002005006100313350190040035016001335530071200123500122323355022003300100532001355022225335001135500a003221350022253353300c002008112223300200a004130060030023200135501b2211222533500110022213300500233355300712001005004001112122230030041121222300100432001355018221122533500115013221335014300400233553006120010040013200135501722112225335001135006003221333500900530040023335530071200100500400112350012200112350012200222333573466e3c008004048044888c8c8c004014c8004d5405c88cd400520002235002225335333573466e3c0080240640604c01c0044c01800cc8004d5405888cd400520002235002225335333573466e3c00801c06005c40044c01800c4cd4004894cd40088400c4005401048848cc00400c008894cd400440384cd5ce00100691a80091001090911801001889100091a8009111002190009aa805910891299a8008a80311099a803980200119aa98030900080200088910010910911980080200191199ab9a3370e00400200c00a910100225335002100110031220021220012233700004002464c649319ab9c4901024c67001200111221233001003002112323001001223300330020020011';

// const scriptCbor =
//   '5911690100003323322333222332233223232333222323332223233333333222222223233322232333322223232332232333222323332223232332233223232333332222233223322332233223322332222323232323232232232325335303833300d3333573466e1cd55cea805a400046666664444446666660ba00c00a0080060040026eb8d5d0a8059bad35742a0146eb8d5d0a8049bae35742a0106eb8d5d0a8039bad357426ae89401c8d4138d4c13ccd5ce2490350543100050499263333573466e1d40112002205423333573466e1d40152000205623504f353050335738921035054310005149926498cccd5cd19b8735573aa004900011980819191919191919191919191999ab9a3370e6aae75402920002333333333301e33502c232323333573466e1cd55cea80124000466048607e6ae854008c0c4d5d09aba2500223505e35305f3357389201035054310006049926135573ca00226ea8004d5d0a80519a8160169aba150093335503375ca0646ae854020ccd540cdd728191aba1500733502c04835742a00c66a05866aa0b20a2eb4d5d0a8029919191999ab9a3370e6aae754009200023350263232323333573466e1cd55cea80124000466a05c66a08eeb4d5d0a80118261aba135744a00446a0c46a60c666ae712401035054310006449926135573ca00226ea8004d5d0a8011919191999ab9a3370e6aae7540092000233502c33504775a6ae854008c130d5d09aba250022350623530633357389201035054310006449926135573ca00226ea8004d5d09aba2500223505e35305f3357389201035054310006049926135573ca00226ea8004d5d0a80219a8163ae35742a00666a05866aa0b2eb88004d5d0a801181f1aba135744a00446a0b46a60b666ae71241035054310005c49926135744a00226ae8940044d5d1280089aba25001135744a00226ae8940044d5d1280089aba25001135573ca00226ea8004d5d0a8011919191999ab9a3370ea00290031181198201aba135573ca00646666ae68cdc3a801240084604460946ae84d55cf280211999ab9a3370ea006900111811181a9aba135573ca00a46666ae68cdc3a802240004604a6eb8d5d09aab9e50062350553530563357389201035054310005749926499264984d55cea80089baa001357426ae8940088d4138d4c13ccd5ce249035054310005049926104f13504d35304e3357389201035054350004f4984d55cf280089baa001135573a6ea80044d5d1280089aba25001135744a00226ae8940044d55cf280089baa0012212330010030022001222222222212333333333300100b00a00900800700600500400300220012212330010030022001122123300100300212001122123300100300212001122123300100300212001212222300400521222230030052122223002005212222300100520011232230023758002640026aa072446666aae7c004940388cd4034c010d5d080118019aba200203323232323333573466e1cd55cea801a4000466600e6464646666ae68cdc39aab9d5002480008cc034c0c4d5d0a80119a8098169aba135744a00446a06c6a606e66ae71241035054310003849926135573ca00226ea8004d5d0a801999aa805bae500a35742a00466a01eeb8d5d09aba25002235032353033335738921035054310003449926135744a00226aae7940044dd50009110919980080200180110009109198008018011000899aa800bae75a224464460046eac004c8004d540cc88c8cccd55cf80112804919a80419aa81898031aab9d5002300535573ca00460086ae8800c0b84d5d08008891001091091198008020018900089119191999ab9a3370ea002900011a80418029aba135573ca00646666ae68cdc3a801240044a01046a0526a605466ae712401035054310002b499264984d55cea80089baa001121223002003112200112001232323333573466e1cd55cea8012400046600c600e6ae854008dd69aba135744a00446a0466a604866ae71241035054310002549926135573ca00226ea80048848cc00400c00880048c8cccd5cd19b8735573aa002900011bae357426aae7940088d407cd4c080cd5ce24810350543100021499261375400224464646666ae68cdc3a800a40084a00e46666ae68cdc3a8012400446a014600c6ae84d55cf280211999ab9a3370ea00690001280511a8111a981199ab9c490103505431000244992649926135573aa00226ea8004484888c00c0104488800844888004480048c8cccd5cd19b8750014800880188cccd5cd19b8750024800080188d4068d4c06ccd5ce249035054310001c499264984d55ce9baa0011220021220012001232323232323333573466e1d4005200c200b23333573466e1d4009200a200d23333573466e1d400d200823300b375c6ae854014dd69aba135744a00a46666ae68cdc3a8022400c46601a6eb8d5d0a8039bae357426ae89401c8cccd5cd19b875005480108cc048c050d5d0a8049bae357426ae8940248cccd5cd19b875006480088c050c054d5d09aab9e500b23333573466e1d401d2000230133016357426aae7940308d407cd4c080cd5ce2481035054310002149926499264992649926135573aa00826aae79400c4d55cf280109aab9e500113754002424444444600e01044244444446600c012010424444444600a010244444440082444444400644244444446600401201044244444446600201201040024646464646666ae68cdc3a800a400446660106eb4d5d0a8021bad35742a0066eb4d5d09aba2500323333573466e1d400920002300a300b357426aae7940188d4040d4c044cd5ce2490350543100012499264984d55cea80189aba25001135573ca00226ea80048488c00800c888488ccc00401401000c80048c8c8cccd5cd19b875001480088c018dd71aba135573ca00646666ae68cdc3a80124000460106eb8d5d09aab9e500423500a35300b3357389201035054310000c499264984d55cea80089baa001212230020032122300100320011122232323333573466e1cd55cea80124000466aa016600c6ae854008c014d5d09aba25002235007353008335738921035054310000949926135573ca00226ea8004498480048004448848cc00400c008448004488008488004800488888848cccccc00401c01801401000c0088004448c8c00400488cc00cc008008004cc8c8c8ccc888c8c8cc88c8c8ccc888c8c8cccc8888c8cc88cc88c8c8cc88cc88c8c8c8c8cc88ccc888ccc888ccc888cccccccc88888888cc88ccccc88888cccc8888cc88cc88cc88ccc888cc88cc88cc88cc88cc88c8c8c8c888c888c94cd4c0dc00c54cd4c168cc0f4c028ccc01cccd54c128480054111414ccc02001940052201004881003303e3303c4800920c801300a35303a00522222200515335305a333573466e1cccc01cccd54c128480054111414ccc0214cd4d4144d4c0354004888888888800c4c178588854cd4d414c0044008884c188594004d4c0e8014888888010d4c0e801488888800d200205c05b15335305a3303d300a33300733355304a12001504450533300835303a0052222220065001489004881003303e3303c3370266e0520d00f48050d4c0e801488888800520d00f300a35303a00522222200515335305a5335305a333573466e1d4011200005c05b105c13303d300a33300733355304a12001504450533300835303a0052222220025001489004881003303e3303c5004483403cc028d4c0e80148888880144ccd5cd19b87323320013200133355305112001323350592233350590030010023505600133505822230033002001200122337000029001000a4000666aa60942400244a66a60b86a602a6a60260044440064466a607000440c04a66a6a034004420c220c2266a0a80040022002a0a6664464600266aa60182400246a6026002440026a6020a0084444444444014640026aa0c244a66a6a0aa0022006442646600e0060026008002a0a4a0a6900102e02d882d882d882d882d899911a98078011111111111299a9a810999aa982e0900099a83191299a9a811801108018800a8111299a9833999ab9a3371e0180020d20d026a0480022a046006420d220ce6a6016004440046a607400a44444400c26a60140024400426a606c0024444440024446464600200a640026aa0b84466a6a0a00029000111a9aa82480111299a982e999ab9a3371e0040120be0bc2600e0022600c006640026aa0b64466a6a09e0029000111a9aa82400111299a982e199ab9a3371e00400e0bc0ba20022600c006446a600e0024444444444666aa609c24002446a602e0044446a60380064466a607e0044a66a60cc666ae68cdc780a000834033899a82f00280388039003a82b804990009aa82b110891299a9a8260008a82711099a827980200119aa980309000802000919a81d000a40044424660020060044002444444444424666666666600201601401201000e00c00a0080060044002442466002006004400244424666002008006004400244246600200600440022424460040062244002240022442466002006004240022442466002006004240022442466002006004240022424446006008224440042244400224002424444600800a424444600600a424444600400a424444600200a40024424660020060044002424444444600e01044244444446600c012010424444444600a010244444440082444444400644244444446600401201044244444446600201201040024244600400644424466600200a00800640024244600400642446002006400224400424400240024444442466666600200e00c00a0080060044002446600a66e080094cd4c080ccd5cd19b870014800008808452000153353020333573466e2400520000210221480084cdc0a40009001299a9810199ab9a337100029000011010899b8148000004400488d4d401c00888d4d402400c88c94cd4c090ccd5cd19b87005003026025153353024333573466e1c0100080980944098540045400454cd4c08cccd5cd19b893370400800266e0800800c0940904090409488d4d401800888d4d402000c88cc01ccdc100200119b8200300122325335301e333573466e1c009200002001f132635300433573892103505433000054984cd401ccdc2001a80099b84002500113301c5335301d333573466e20009200001f01e13370290000010801299a980e999ab9a33710002900000f80f099b8148000004400448004800448848cc00400c00848004488cd54c034480048d4d5401c00488cd54028008cd54c040480048d4d5402800488cd54034008ccd4d5403c0048cc0892000001223302300200123302200148000004cd54c034480048d4d5401c00488cd54028008ccd4d540300048cd54c044480048d4d5402c00488cd54038008d5404c00400488ccd55402006c0080048cd54c044480048d4d5402c00488cd54038008d54044004004ccd55400c058008004444888ccd54c020480054040cd54c034480048d4d5401c00488cd54028008d5403c004ccd54c0204800488d4d54020008894cd4c070ccd54c04848004c8cd406888ccd4d402c00c88008008004d4d402400488004cd4024894cd4c078008408040040748d4d5402c00488cc028008014018400c4cd405001000d4044004cd54c034480048d4d5401c00488c8cd5402c00cc004014c8004d54080894cd4d40500044d5403c00c884d4d54034008894cd4c084cc0300080204cd5405001c0044c01800c00848848cc00400c00848004448848cc00400c008448004c8004d5405488448894cd4d40300044008884cc014008ccd54c01c480040140100044484888c00c01044884888cc0080140104484888c004010448004c8004d540408844894cd4d401800454020884cd4024c010008cd54c01848004010004c8004d5403c88448894cd4d40180044d402400c884ccd4030014c010008ccd54c01c480040140100044488008488488cc00401000c4800448d4d400c0048800448d4d40080048800848848cc00400c0084800488ccd5cd19b8f0020010060053200135500622253353004333573466e1c005200000600510021330030013370a00400224400424400240024466e0000800498448c8c00400488cc00cc00800800522011c09aaedfc2c267948a623a4dddd093327c235c3fa88a47f14d41a73470001';

const scriptCbor = '59079559079201000033232323232323232323232323232332232323232323232222232325335333006300800530070043333573466e1cd55cea80124000466442466002006004646464646464646464646464646666ae68cdc39aab9d500c480008cccccccccccc88888888888848cccccccccccc00403403002c02802402001c01801401000c008cd4060064d5d0a80619a80c00c9aba1500b33501801a35742a014666aa038eb9406cd5d0a804999aa80e3ae501b35742a01066a0300466ae85401cccd54070091d69aba150063232323333573466e1cd55cea801240004664424660020060046464646666ae68cdc39aab9d5002480008cc8848cc00400c008cd40b9d69aba15002302f357426ae8940088c98c80c8cd5ce01981901809aab9e5001137540026ae854008c8c8c8cccd5cd19b8735573aa004900011991091980080180119a8173ad35742a004605e6ae84d5d1280111931901919ab9c033032030135573ca00226ea8004d5d09aba2500223263202e33573805e05c05826aae7940044dd50009aba1500533501875c6ae854010ccd540700808004d5d0a801999aa80e3ae200135742a00460446ae84d5d1280111931901519ab9c02b02a028135744a00226ae8940044d5d1280089aba25001135744a00226ae8940044d5d1280089aba25001135744a00226ae8940044d55cf280089baa00135742a00460246ae84d5d1280111931900e19ab9c01d01c01a101b13263201b3357389201035054350001b135573ca00226ea80054049404448c88c008dd6000990009aa80a911999aab9f0012500a233500930043574200460066ae880080548c8c8cccd5cd19b8735573aa004900011991091980080180118061aba150023005357426ae8940088c98c8054cd5ce00b00a80989aab9e5001137540024646464646666ae68cdc39aab9d5004480008cccc888848cccc00401401000c008c8c8c8cccd5cd19b8735573aa0049000119910919800801801180a9aba1500233500f014357426ae8940088c98c8068cd5ce00d80d00c09aab9e5001137540026ae854010ccd54021d728039aba150033232323333573466e1d4005200423212223002004357426aae79400c8cccd5cd19b875002480088c84888c004010dd71aba135573ca00846666ae68cdc3a801a400042444006464c6403866ae700740700680640604d55cea80089baa00135742a00466a016eb8d5d09aba2500223263201633573802e02c02826ae8940044d5d1280089aab9e500113754002266aa002eb9d6889119118011bab00132001355012223233335573e0044a010466a00e66442466002006004600c6aae754008c014d55cf280118021aba200301313574200222440042442446600200800624464646666ae68cdc3a800a40004642446004006600a6ae84d55cf280191999ab9a3370ea0049001109100091931900899ab9c01201100f00e135573aa00226ea80048c8c8cccd5cd19b875001480188c848888c010014c01cd5d09aab9e500323333573466e1d400920042321222230020053009357426aae7940108cccd5cd19b875003480088c848888c004014c01cd5d09aab9e500523333573466e1d40112000232122223003005375c6ae84d55cf280311931900899ab9c01201100f00e00d00c135573aa00226ea80048c8c8cccd5cd19b8735573aa004900011991091980080180118029aba15002375a6ae84d5d1280111931900699ab9c00e00d00b135573ca00226ea80048c8cccd5cd19b8735573aa002900011bae357426aae7940088c98c802ccd5ce00600580489baa001232323232323333573466e1d4005200c21222222200323333573466e1d4009200a21222222200423333573466e1d400d2008233221222222233001009008375c6ae854014dd69aba135744a00a46666ae68cdc3a8022400c4664424444444660040120106eb8d5d0a8039bae357426ae89401c8cccd5cd19b875005480108cc8848888888cc018024020c030d5d0a8049bae357426ae8940248cccd5cd19b875006480088c848888888c01c020c034d5d09aab9e500b23333573466e1d401d2000232122222223005008300e357426aae7940308c98c8050cd5ce00a80a00900880800780700680609aab9d5004135573ca00626aae7940084d55cf280089baa0012323232323333573466e1d400520022333222122333001005004003375a6ae854010dd69aba15003375a6ae84d5d1280191999ab9a3370ea0049000119091180100198041aba135573ca00c464c6401a66ae7003803402c0284d55cea80189aba25001135573ca00226ea80048c8c8cccd5cd19b875001480088c8488c00400cdd71aba135573ca00646666ae68cdc3a8012400046424460040066eb8d5d09aab9e500423263200a33573801601401000e26aae7540044dd500089119191999ab9a3370ea00290021091100091999ab9a3370ea00490011190911180180218031aba135573ca00846666ae68cdc3a801a400042444004464c6401666ae7003002c02402001c4d55cea80089baa0012323333573466e1d40052002212200223333573466e1d40092000212200123263200733573801000e00a00826aae74dd5000891999ab9a3370e6aae74dd5000a40004008464c6400866ae700140100092612001490103505431001123230010012233003300200200122212200201';

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
    const addr = (await wallet.getUsedAddresses())[0]; // buyer's address
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
