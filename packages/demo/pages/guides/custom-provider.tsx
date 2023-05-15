import type { NextPage } from 'next';
import Link from 'next/link';
import GuidesLayout from '../../components/pages/guides/layout';
import Codeblock from '../../components/ui/codeblock';
import { Element } from 'react-scroll';
import Metatags from '../../components/site/metatags';

const GuideCustomProviderPage: NextPage = () => {
  const sidebarItems = [
    { label: 'How it works', to: 'howworks' },
    { label: 'Implement Your Own Provider', to: 'template' },
    { label: 'Implement Constructor and Functions', to: 'implement' },
  ];

  // - What is a Mesh Provider?
  // - Provider Types
  // - Why you may want to implement your own Provider?
  // - Look at an existing provider implementation
  // - Implement a custom GraphQL fetcher

  return (
    <>
      <Metatags
        title="Implement Custom Provider"
        description="Build custom Providers that provides an API to access and process information provided by services."
        image="/guides/implement-custom-provider.png"
      />
      <GuidesLayout
        title="Implement Custom Provider"
        desc="Build custom Providers that provides an API to access and process information provided by services."
        sidebarItems={sidebarItems}
        image="/guides/service-g2192fe835_640.jpg"
      >
        <IntroSection />
        <HowItWorksSection />
        <StarterSection />
        <ImplementSection />
      </GuidesLayout>
    </>
  );
};

function IntroSection() {
  return (
    <>
      <p>
        As of writing (Dec 2022), Mesh offers three options:{' '}
        <a href="https://blockfrost.io/" target="_blank" rel="noreferrer">
          Blockfrost
        </a>
        ,{' '}
        <a href="https://tangocrypto.com/" target="_blank" rel="noreferrer">
          Tangocrypto
        </a>
        , or{' '}
        <a href="https://www.koios.rest/" target="_blank" rel="noreferrer">
          Koios
        </a>{' '}
        (see a list of <Link href="/providers">Providers</Link>) . These
        blockchain providers allow developers to access the Cardano blockchain
        and retrieve intricate data. For example, they can be used to query the
        UTXO of a smart contract and use it as part of a transaction, or to
        submit a signed transaction to the chain.
      </p>
      <p>
        You can customize a provider to utilize GraphQL, cardano-cli, or
        websocket with Mesh SDK. Whatever the query method used to obtain the
        data, it will work perfectly with Mesh SDK so long as the output of the function 
        is compatible with the interface.
      </p>
      <p>
        This guide will show us how to make a custom provider and how to
        integrate it with Mesh so that it works in tandem with the transaction
        builder.
      </p>
    </>
  );
}

function HowItWorksSection() {
  let codeIFetcher = ``;
  codeIFetcher += `import type { AccountInfo, AssetMetadata, Protocol, UTxO } from '@mesh/common/types';\n\n`;
  codeIFetcher += `export interface IFetcher {\n`;
  codeIFetcher += `  fetchAccountInfo(address: string): Promise<AccountInfo>;\n`;
  codeIFetcher += `  fetchAddressUTxOs(address: string, asset?: string): Promise<UTxO[]>;\n`;
  codeIFetcher += `  fetchAssetAddresses(asset: string): Promise<{ address: string; quantity: string }[]>;\n`;
  codeIFetcher += `  fetchAssetMetadata(asset: string): Promise<AssetMetadata>;\n`;
  codeIFetcher += `  fetchHandleAddress(handle: string): Promise<string>;\n`;
  codeIFetcher += `  fetchProtocolParameters(epoch: number): Promise<Protocol>;\n`;
  codeIFetcher += `}\n`;

  return (
    <Element name="howworks">
      <h2>How Does It Work?</h2>
      <p>
        JavaScript interfaces are structures that define the interface of an
        application: they are used to define the syntax for classes to follow. Thus, any classes which
        are based on an interface must abide by the structure laid out in the
        interface.
      </p>
      <p>
        All providers have one or more interface(s). For example, the{' '}
        <code>KoiosProvider</code> Class implements the{' '}
        <code>IFetcher</code> and <code>ISubmitter</code> interfaces, thus{' '}
        <code>KoiosProvider</code> needs to strictly conform to the structure of
        these two interfaces.
      </p>
      <p>
        <code>IFetcher</code> and <code>ISubmitter</code> are implemented in the{' '}
        <code>KoiosProvider</code> class using the <code>implement</code>{' '}
        keyword:
      </p>
      <Codeblock
        data={`export class KoiosProvider implements IFetcher, ISubmitter {}`}
        isJson={false}
      />
      <p>
        To see the latest up-to-date list of interfaces used by Mesh, visit the GitHub
        repo,{' '}
        <a
          href="https://github.com/MeshJS/mesh/tree/main/packages/module/src/common/contracts"
          target="_blank"
          rel="noreferrer"
        >
          packages/module/src/common/contracts
        </a>
        .
      </p>
      <p>
        To create a custom provider class, one must create functions with the
        same name, input parameters, and return type as the list of defined
        methods for each interface. Doing so will allow the functions to work as
        expected when building transactions and any of the other many functions provided in
        Mesh.
      </p>
      <p>
        For example, as of writing, <code>IFetcher</code> has 6 functions (see{' '}
        <a
          href="https://github.com/MeshJS/mesh/blob/main/packages/module/src/common/contracts/fetcher.ts"
          target="_blank"
          rel="noreferrer"
        >
          packages/module/src/common/contracts/fetcher.ts
        </a>{' '}
        for latest implemention):
      </p>
      <Codeblock data={codeIFetcher} isJson={false} />
      <p>
        As such, <code>KoiosProvider</code> must implement these functions as
        defined in <code>IFetcher</code>.
      </p>
    </Element>
  );
}

function StarterSection() {
  let code = ``;
  code += `import { IFetcher, ISubmitter } from "@mesh/common/contracts";\n`;
  code += `import { parseHttpError } from "@mesh/common/utils";\n`;
  code += `import type {\n`;
  code += `  AccountInfo,\n`;
  code += `  AssetMetadata,\n`;
  code += `  Protocol,\n`;
  code += `  UTxO,\n`;
  code += `} from "@mesh/common/types";\n`;
  code += `\n`;
  code += `export class NAMEProvider implements IFetcher, ISubmitter {\n`;
  code += `  constructor(network: "") {\n`;
  code += `    // init variables and other Javascript libraries needed\n`;
  code += `  }\n`;
  code += `\n`;
  code += `  async fetchAccountInfo(address: string): Promise<AccountInfo> {\n`;
  code += `    try {\n`;
  code += `      // return <AccountInfo>{\n`;
  code += `      //   ...\n`;
  code += `      // };\n`;
  code += `    } catch (error) {\n`;
  code += `      throw parseHttpError(error);\n`;
  code += `    }\n`;
  code += `  }\n`;
  code += `\n`;
  code += `  async fetchAddressUTxOs(address: string, asset?: string): Promise<UTxO[]> {\n`;
  code += `    try {\n`;
  code += `      // return <UTxO[]>[\n`;
  code += `      //   ...\n`;
  code += `      // ];\n`;
  code += `    } catch (error) {\n`;
  code += `      throw parseHttpError(error);\n`;
  code += `    }\n`;
  code += `  }\n`;
  code += `\n`;
  code += `  async fetchAssetAddresses(\n`;
  code += `    asset: string\n`;
  code += `  ): Promise<{ address: string; quantity: string }[]> {\n`;
  code += `    try {\n`;
  code += `      // return AssetAddresses;\n`;
  code += `    } catch (error) {\n`;
  code += `      throw parseHttpError(error);\n`;
  code += `    }\n`;
  code += `  }\n`;
  code += `\n`;
  code += `  async fetchAssetMetadata(asset: string): Promise<AssetMetadata> {\n`;
  code += `    try {\n`;
  code += `      // return <AssetMetadata>[\n`;
  code += `      //   ...\n`;
  code += `      // ];\n`;
  code += `    } catch (error) {\n`;
  code += `      throw parseHttpError(error);\n`;
  code += `    }\n`;
  code += `  }\n`;
  code += `\n`;
  code += `  async fetchHandleAddress(handle: string): Promise<string> {\n`;
  code += `    try {\n`;
  code += `      // return handleAddress;\n`;
  code += `    } catch (error) {\n`;
  code += `      throw parseHttpError(error);\n`;
  code += `    }\n`;
  code += `  }\n`;
  code += `\n`;
  code += `  async fetchProtocolParameters(epoch = Number.NaN): Promise<Protocol> {\n`;
  code += `    try {\n`;
  code += `      // return <Protocol>{\n`;
  code += `      //   ...\n`;
  code += `      // };\n`;
  code += `    } catch (error) {\n`;
  code += `      throw parseHttpError(error);\n`;
  code += `    }\n`;
  code += `  }\n`;
  code += `\n`;
  code += `  async submitTx(tx: string): Promise<string> {\n`;
  code += `    try {\n`;
  code += `      // if (status === 200)\n`;
  code += `      //   return txHash;\n`;
  code += `    } catch (error) {\n`;
  code += `      throw parseHttpError(error);\n`;
  code += `    }\n`;
  code += `  }\n`;
  code += `}\n`;

  return (
    <Element name="template">
      <h2>Implement Your Own Provider</h2>
      <p>
        If you want to begin utilizing your own provider, looking at one of the
        existing providers is the ideal way to get started. Visit the GitHub
        repo,{' '}
        <a
          href="https://github.com/MeshJS/mesh/tree/main/packages/module/src/providers"
          target="_blank"
          rel="noreferrer"
        >
          packages/module/src/providers
        </a>{' '}
        to see a list of providers.
      </p>
      <p>This code base below can be used as a starting point:</p>
      <Codeblock data={code} isJson={false} />
      <p>
        However, please note that it may no longer be valid when the interface is updated. It is
        also important to note that the interface you require may not be{' '}
        <code>IFetcher</code> or <code>ISubmitter</code>, but rather other
        interfaces, depending on the purpose of the provider you are
        implementing.
      </p>
    </Element>
  );
}

function ImplementSection() {
  let code = ``;
  code += `private readonly _axiosInstance: AxiosInstance;\n\n`;
  code += `constructor(network: 'api' | 'preview' | 'preprod' | 'guild', version = 0) {\n`;
  code += `  this._axiosInstance = axios.create({\n`;
  code += `    baseURL: \`https://\${network}.koios.rest/api/v\${version}\`,\n`;
  code += `  });\n`;
  code += `}\n`;

  let codePP = ``;
  codePP += `async fetchProtocolParameters(epoch: number): Promise<Protocol> {\n`;
  codePP += `  try {\n`;
  codePP += `    const { data, status } = await this._axiosInstance.get(\n`;
  codePP += `      \`epoch_params?_epoch_no=\${epoch}\`,\n`;
  codePP += `    );\n`;
  codePP += `\n`;
  codePP += `    if (status === 200)\n`;
  codePP += `      return <Protocol>{\n`;
  codePP += `        coinsPerUTxOSize: data[0].coins_per_utxo_size,\n`;
  codePP += `        collateralPercent: data[0].collateral_percent,\n`;
  codePP += `        decentralisation: data[0].decentralisation,\n`;
  codePP += `        epoch: data[0].epoch_no,\n`;
  codePP += `        keyDeposit: data[0].key_deposit,\n`;
  codePP += `        maxBlockExMem: data[0].max_block_ex_mem.toString(),\n`;
  codePP += `        maxBlockExSteps: data[0].max_block_ex_steps.toString(),\n`;
  codePP += `        maxBlockHeaderSize: data[0].max_bh_size,\n`;
  codePP += `        maxBlockSize: data[0].max_block_size,\n`;
  codePP += `        maxCollateralInputs: data[0].max_collateral_inputs,\n`;
  codePP += `        maxTxExMem: data[0].max_tx_ex_mem.toString(),\n`;
  codePP += `        maxTxExSteps: data[0].max_tx_ex_steps.toString(),\n`;
  codePP += `        maxTxSize: data[0].max_tx_size,\n`;
  codePP += `        maxValSize: data[0].max_val_size.toString(),\n`;
  codePP += `        minFeeA: data[0].min_fee_a,\n`;
  codePP += `        minFeeB: data[0].min_fee_b,\n`;
  codePP += `        minPoolCost: data[0].min_pool_cost,\n`;
  codePP += `        poolDeposit: data[0].pool_deposit,\n`;
  codePP += `        priceMem: data[0].price_mem,\n`;
  codePP += `        priceStep: data[0].price_step,\n`;
  codePP += `      };\n`;
  codePP += `\n`;
  codePP += `    throw parseHttpError(data);\n`;
  codePP += `  } catch (error) {\n`;
  codePP += `    throw parseHttpError(error);\n`;
  codePP += `  }\n`;
  codePP += `}\n`;

  return (
    <Element name="implement">
      <h2>Implement Constructor and Functions</h2>
      <p>To start, we want to define the constructor.</p>
      <p>
        A constructor is a special function that creates and initializes a
        class. This constructor gets called when an object is created using the{' '}
        <code>new</code> keyword. The purpose of a constructor is to create a
        new object and set values for any existing object properties.
      </p>
      <p>
        When setting up a provider, it is usually necessary to provide some
        basic information, such as which network it should be connected to and
        if an API key is required.
      </p>
      <p>
        In the case of <code>KoiosProvider</code>, we want the users to define
        the <code>network</code> and <code>version</code> (optional):
      </p>
      <Codeblock data={code} isJson={false} />
      <p>
        This constructor initializes the Axios instance, with the parameters
        provided by the user.
      </p>
      <p>
        Next, we can define each function that is required by the interface. To
        do this, you must understand the answers to the following:
      </p>
      <ul>
        <li>how to query the blockchain provider?</li>
        <li>what are the input parameters of the interface?</li>
        <li>
          what are the input parameters needed to query the blockchain provider?
        </li>
        <li>what are the expected outputs of the interface?</li>
        <li>what is being returned by the blockchain provider?</li>
      </ul>
      <p>
        By knowing the inputs and outputs of both the interface and the
        blockchain provider, one can create the functions that map the data correctly from the
        blockchain provider to the interface's required data type.
      </p>
      <p>
        For example, below we have implemeted the <code>fetchProtocolParameters()</code>{' '}
        for <code>KoiosProvider</code> to map the responses returned from Koios,
        transforming the output into the required <code>Protocol</code> data
        type.  This function is used for fetching protocol parameters:
      </p>
      <Codeblock data={codePP} isJson={false} />
      <p>
        To complete implementation of your custom provider, simply do the same for every function
        specified by the interface and test that they work as expected.
      </p>
      <p>
        If you think that the provider you have implemented will benefit the
        Cardano developer community,{' '}
        <a
          href="https://github.com/MeshJS/mesh/pulls"
          target="_blank"
          rel="noreferrer"
        >
          create a pull request
        </a>
        .
      </p>
    </Element>
  );
}

export default GuideCustomProviderPage;
