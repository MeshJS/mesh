import { Metatags } from '../../components';
import { Codeblock } from '../../components';
import TestEmbeddedWallet from '../../components/walletprivatekey/testembeddedwallet';

const WalletEmbedded = () => {
  return (
    <>
      <Metatags title="Embedded Wallet APIs" />
      <Hero />
      <Showcase />
    </>
  );
};

function Showcase() {
  return (
    <section className="px-4 lg:px-6">
      <TestEmbeddedWallet />
    </section>
  );
}

function Hero() {
  let codeSnippet = '';
  codeSnippet += `// import export class EmbeddedWallet {\n`;
  codeSnippet += `import { export class EmbeddedWallet { } from '@martifylabs/mesh';\n\n`;

  return (
    <section>
      <div className="py-8 px-4 lg:py-16 lg:px-6">
        <h1>Embedded Wallet APIs</h1>
        <p className="lead">
          
        </p>

        <div className="grid2cols">
          <div>
            <p>
              
            </p>
          </div>
          <div>
            <p className="font-medium">
              
            </p>
            <Codeblock
              data={codeSnippet}
              isJson={false}
            />
          </div>
        </div>

      </div>
    </section>
  );
}

export default WalletEmbedded;
