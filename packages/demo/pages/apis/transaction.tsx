import { Metatags } from '../../components';
import SendAda from '../../components/transaction/sendAda';
import SendMultiassets from '../../components/transaction/sendMultiassets';
import LockUnlockContract from '../../components/transaction/lockUnlockContract';
import { Codeblock } from '../../components';
import Minting from '../../components/transaction/minting';

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
        <SendAda />
        <SendMultiassets />
        <LockUnlockContract />
        <Minting />
      </div>
    </section>
  );
}

function Hero() {
  let codeSnippet = '';
  codeSnippet += `// import Transaction and BrowserWallet\n`;
  codeSnippet += `import { Transaction, BrowserWallet } from '@martifylabs/mesh';\n\n`;
  codeSnippet += `// connect to a wallet\n`;
  codeSnippet += `const wallet = await BrowserWallet.enable('eternl');\n\n`;
  codeSnippet += `// initiate a new Transaction with the connected wallet\n`;
  codeSnippet += `const tx = new Transaction({ initiator: wallet });`;

  return (
    <section>
      <div className="py-8 px-4 lg:py-16 lg:px-6">
        <h1>Transaction APIs</h1>
        <p className="lead">Let&apos;s create some transactions.</p>

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
