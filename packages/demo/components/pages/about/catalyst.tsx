import Link from 'next/link';

export default function Catalyst() {
  return (
    <>
      <section className="bg-white dark:bg-gray-900">
        <div className="py-8 px-4 mx-auto max-w-screen-xl lg:py-16 lg:px-6">
          <div className="px-4 mx-auto mb-8 text-left md:mb-16 lg:px-0">
            <h2 className="mb-4 text-3xl tracking-tight font-extrabold text-gray-900 md:text-4xl dark:text-white">
              Catalyst
            </h2>
            <p className="font-light text-gray-500 sm:text-xl dark:text-gray-400 mb-4">
              Here are proposals that we have submitted to Project Catalyst and
              its progress.
            </p>
            <div className="grid grid-cols-3 gap-2 w-full">
              <ListOfProposals />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function ListOfProposals() {
  return (
    <>
      <CardLink
        title="Mesh x Defy x Yaci: Private Blockchain Networks for enabling real world financial services and Cardano Adoption (F12)"
        desc="?"
        url=""
        completed={[]}
        tobecompleted={[
          `Design, setup and deploy Yaci cloud infrastructure`,
          `Mesh upgrades to support transaction building and wallets integration on Yaci`,
          `An identity solution, smart contracts that define regulators requirements to support users' identity and KYC records.`,
          `A KYC solution, smart contracts that define regulators requirements to support KYC processes.`,
          `A KYC verification solution, smart contracts that define how users' records are verified which results in reputation scores and incentivization mechanism.`,
          `Whitepaper about private network and KYC use case`,
        ]}
      />

      <CardLink
        title="zkFold x Defy: Derisking cross-border payments with Zero-Knowledge Proofs (F12)"
        desc="?"
        url=""
        completed={[]}
        tobecompleted={['?', '?', '?', '?']}
      />
      
      <CardLink
        title="Mesh New Features to Improve Developer experience and Cardano Adoption (F12)"
        desc="?"
        url=""
        completed={[]}
        tobecompleted={[
          'CIP 45',
          'Mesh application wallet',
          'Modular CSL library',
          'Improve error messages',
          'Wallet support for private blockchain networks (Yaci)',
        ]}
      />

      <CardLink
        title="Mesh Software as a Service (F12)"
        desc="?"
        url=""
        completed={[]}
        tobecompleted={[
          'Cloud infrastructure and transaction endpoints',
          'Upgrade Mesh SDK to support SaaS',
          'Hosted wallet / private key for signing',
          'User-defined transaction building',
          'JSON schema for transaction',
        ]}
      />

      <CardLink
        title="Mesh - Advance Cardano SDK in Rust (F12)"
        desc="?"
        url=""
        completed={[]}
        tobecompleted={['?', '?', '?', '?']}
      />

      <CardLink
        title="Aiken Open-Source Smart Contract Library (F11)"
        desc="We create a collection of open-source smart contracts with Aiken (including Workspace, Mesh TX builder components) and integrate them into the Mesh SDK library on Github - open and accessible to all. "
        url="https://projectcatalyst.io/funds/11/cardano-open-developers/aiken-open-source-smart-contract-library-by-meshjs-and-trustlevel"
        completed={[
          'Marketplace contract',
          'Escrow contract',
          'Vesting contract',
          'Gift card contract',
          'Coupon bond guaranteed contract',
        ]}
        tobecompleted={[
          'Content ownership contract',
          'Advanced contract #2',
          'Advanced contract #3',
          'Bad examples',
        ]}
      />
      <CardLink
        title="Sustain & Maintain MeshJS (F11)"
        desc="This proposal enables implementations not limited to Voltaire features, Hydra & Aiken integration, and data providers integrations. Including bounties for issues, features, and learning materials."
        url="https://projectcatalyst.io/funds/11/cardano-open-developers/sustain-and-maintain-meshjs"
        completed={[
          'Lower-level APIs completed',
          'Technical documentation released',
          'Resolved numerous reported GitHub issues',
          'Active Discord and social to help developers',
        ]}
        tobecompleted={[
          'Plutus version 3 integration',
          'Revamped/refactored transaction and utilities class',
          'Conway features',
        ]}
      />

      <CardLink
        title="Supporting Open-Source Library Development, Developer Resources & Builder Community (F10)"
        desc="To guarantee and ensure sustainability of a team dedicated to maintaining and developing one of the best open-source libraries on Cardano, providing devs with something easy-to-use, fun and productive."
        url="https://projectcatalyst.io/funds/10/f10-osde-open-source-dev-ecosystem/meshjs-sdk-operations-supporting-open-source-library-development-developer-resources-and-builder-community"
        completed={[
          'Lower-level APIs core functionality',
          'Mesh PBL course content',
          'Workshops and live coding',
          'Community Q&A support',
        ]}
        tobecompleted={['Mesh PBL Season #1']}
      />
    </>
  );
}

function CardLink({ title, desc, url, completed, tobecompleted }) {
  return (
    <div className="block max-w-sm p-6 bg-white border border-gray-200 rounded-lg shadow dark:bg-gray-800 dark:border-gray-700">
      <h5 className="mb-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
        {title}
      </h5>
      <p className="font-normal text-gray-700 dark:text-gray-400">{desc}</p>
      <ul className="mt-4 text-sm text-gray-500 dark:text-gray-300">
        {completed.map((item, index) => (
          <li key={index} className="flex">
            <div className="h-4 w-4 mr-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4 text-green-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <span>{item}</span>
          </li>
        ))}
      </ul>
      <ul className="mt-4 text-sm text-gray-500 dark:text-gray-300">
        {tobecompleted.map((item, index) => (
          <li key={index} className="flex">
            <div className="h-4 w-4 mr-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4 text-gray-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <circle cx="12" cy="12" r="10" />
              </svg>
            </div>
            <span>{item}</span>
          </li>
        ))}
      </ul>
      {url && (
        <div className="mt-4 text-sm text-gray-500 dark:text-gray-300">
          <Link href={url}>
            <span className="text-blue-500 hover:text-blue-700">
              projectcatalyst.io
            </span>
          </Link>
        </div>
      )}
    </div>
  );
}
