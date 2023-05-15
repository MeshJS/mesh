import Link from 'next/link';
import Codeblock from '../../../ui/codeblock';

export default function List() {
  return (
    <section className="bg-gray-50 dark:bg-gray-900">
      <div className="py-8 px-4 mx-auto max-w-screen-xl sm:py-16 lg:px-6">
        <div className="mx-auto max-w-screen-md text-center mb-8 lg:mb-16">
          <h2 className="mb-4 text-4xl tracking-tight font-extrabold text-gray-900 dark:text-white">
            Cardano Improvement Proposals{' '}
            {/* <span
              style={{
                borderRadius: '1em 0 1em 0',
                backgroundImage:
                  'linear-gradient(-100deg, rgba(0, 255, 20, 0.2), rgba(0, 255, 20, 0.7) 95%, rgba(0, 255, 20, 0.1))',
              }}
            > */}
            Implemented
            {/* </span> */}
          </h2>
          <p className="font-light text-gray-500 dark:text-gray-400 sm:text-xl">
            Mesh ensures your dApp adheres to the standards provided by the
            Cardano Community.
          </p>
        </div>
        <div className="space-y-8 md:grid md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 md:gap-8 xl:gap-8 md:space-y-0">
          <Card
            title="CIP-2: Coin Selection"
            content={
              <>
                <p>
                  Adopted <code>Coin Selection Strategies</code> from Cardano
                  Serialization Lib into{' '}
                  <Link href="/apis/transaction">Transaction</Link>.
                </p>
              </>
            }
          />
          <Card
            title="CIP-8: Message Signing"
            content={
              <>
                <p>
                  Use your wallet to sign message with{' '}
                  <code>wallet.signData</code>, see{' '}
                  <Link href="/apis/appwallet">App Wallet</Link> and{' '}
                  <Link href="/apis/browserwallet">Browser Wallet</Link>.
                </p>
              </>
            }
          />
          <Card
            title="CIP-14: Asset Fingerprint"
            content={
              <>
                <p>
                  Get asset fingerprint with <code>resolveFingerprint</code>,
                  see <Link href="/apis/resolvers">Resolvers</Link>.
                </p>
              </>
            }
          />
          <Card
            title="CIP-25: NFT Metadata"
            content={
              <>
                <p>
                  Import <code>AssetMetadata</code> to adhere to the NFT
                  metadata standards, see{' '}
                  <Link href="/apis/transaction">Transaction</Link>.
                </p>
              </>
            }
          />
          <Card
            title="CIP-27: Royalties Standard"
            content={
              <>
                <p>
                  Learn how to{' '}
                  <Link href="/apis/transaction/minting#mintingRoyaltyToken">
                    mint royalty token
                  </Link>
                  .
                </p>
              </>
            }
          />
          <Card
            title="CIP-30: Cardano dApp-Wallet Web Bridge"
            content={
              <>
                <p>
                  <Link href="/apis/browserwallet">Browser Wallet</Link> is
                  compatible with <code>CIP-30</code> wallets.
                </p>
              </>
            }
          />
          <Card
            title="CIP-31: Reference inputs"
            content={
              <>
                <p>
                  <Link href="/apis/transaction">Transaction</Link> allow users
                  to reference datums when redeem from a V2 plutus script.
                </p>
              </>
            }
          />
          <Card
            title="CIP-32: Inline datums"
            content={
              <>
                <p>
                  <Link href="/apis/transaction">Transaction</Link> allow users
                  to attach inline datums to transaction output.
                </p>
              </>
            }
          />
          <Card
            title="CIP-33: Reference scripts"
            content={
              <>
                <p>
                  <Link href="/apis/transaction">Transaction</Link> allow users
                  to reference a plutus script instead of suppling the whole
                  script as part of the transaction..
                </p>
              </>
            }
          />
          <Card
            title="CIP-1852: Hierarchy for Deterministic Wallets"
            content={
              <>
                <p>
                  <Link href="/apis/appwallet">App Wallet</Link> follows{' '}
                  <code>CIP-1852</code> for deriving Stake and Payment Keys.
                </p>
              </>
            }
          />
        </div>
      </div>
    </section>
  );
}

function Card({ title, content }) {
  return (
    <div className="p-6 bg-white rounded shadow dark:bg-gray-800">
      <h3 className="mb-2 text-xl font-bold dark:text-white">{title}</h3>
      <div className="font-light text-gray-500 dark:text-gray-400 format dark:format-invert">
        {content}
      </div>
    </div>
  );
}

{
  /* <Codeblock data={``} isJson={false} /> */
}
