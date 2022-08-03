import { Metatags } from '../../components';
import ConnectWallet from '../../components/wallet/connectWallet';
import SendAda from '../../components/transaction/sendAda';
import SendMultiassets from '../../components/transaction/sendMultiassets';
// import TransactionBuilder from '../../components/transaction/transactionBuilder';
// import LockAssets from '../../components/transaction/lockAssets';
import { Codeblock } from '../../components';

const Transaction = () => {
  return (
    <>
      <Metatags title="Transaction APIs" />
      <Hero />
      <Showcase />
    </>
  );
};

function Showcase() {
  return (
    <section>
      <div className="mx-auto max-w-screen-xl px-4 lg:px-6">
        <h2>Connect available wallets</h2>
        <ConnectWallet />

        <SendAda />
        <SendMultiassets />
        {/* <TransactionBuilder /> 
        <LockAssets />*/}
      </div>
    </section>
  );
}

function Hero() {
  let codeSnippet = '';
  codeSnippet += `// import TransactionService\n`;
  codeSnippet += `import { TransactionService } from '@martifylabs/mesh'\n\n`;
  codeSnippet += `// connect to a wallet\n`;
  codeSnippet += `const wallet = await WalletService.enable("eternl");\n\n`;
  codeSnippet += `// initiate a new TransactionService with the connected wallet\n`;
  codeSnippet += `const tx = new TransactionService(wallet);`;

  return (
    <section>
      <div className="py-8 px-4 lg:py-16 lg:px-6">
        <h1>Transaction APIs</h1>
        <p className="lead">Let's create some transactions.</p>

        <div className="grid2cols">
          <div>
            <p>Creating a transaction requires various steps:</p>
            <ol>
              <li>
                Build the transaction
                <ol>
                  <li>Get the protocol parameters</li>
                  <li>Define transaction builder config</li>
                  <li>Create transaction outputs</li>
                  <li>Select input UTXOs</li>
                  <li>Calculate fees and assign change address</li>
                </ol>
              </li>
              <li>Sign the transaction</li>
              <li>Submit the transaction</li>
            </ol>
          </div>
          <div>
            <p className="font-medium">
              In this section, let&apos;s create some transactions with Mesh. We
              need the following to create a transaction:
            </p>
            <Codeblock data={codeSnippet} isJson={false} />
          </div>
        </div>
      </div>
    </section>
  );
}

export default Transaction;
