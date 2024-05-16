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
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 w-full">
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
        title="Cardano Service Layer Framework for DApps"
        desc="R&D a framework to quickly spin up a service layer for specific Cardano DApps, allowing DApps to re-use all infrastructure such as contracts and MeshJS, while possible for custom protocol parameters."
        url="https://cardano.ideascale.com/c/idea/121847"
        completed={[]}
        tobecompleted={[
          `Parallel Cardano Blockchain MeshJS Integration`,
          `Customized Protocol Parameters`,
          `Persistent Record & Immutability`,
          `Framework DevOps`,
          `Documentation and training materials`,
        ]}
        fund={'Fund12'}
        status={'Voting'}
      />
      <CardLink
        title="Mesh New Features to Improve Developer experience and Cardano Adoption"
        desc="We will upgrade Mesh by implementing CIP 45, WebRTC wallet connect, handle multiple serialization libs, revamp to support backend transactions building, and improve error messages to improve DevXP."
        url="https://cardano.ideascale.com/c/idea/122160"
        completed={[]}
        tobecompleted={[
          'CIP 45',
          'Mesh application wallet',
          'Modular CSL library',
          'Improve error messages',
          'Wallet support for private blockchain networks (e.g. Yaci)',
        ]}
        fund={'Fund12'}
        status={'Voting'}
      />
      <CardLink
        title="Mesh Software as a Service"
        desc="We provide hosted server instances for wallet and transactions builder by restful APIs, this allow integration and interaction to Cardano blockchain from any technology stacks and systems."
        url="https://cardano.ideascale.com/c/idea/122098"
        completed={[]}
        tobecompleted={[
          'Cloud infrastructure and transaction endpoints',
          'Upgrade Mesh SDK to support SaaS',
          'Hosted wallet / private key for signing',
          'User-defined transaction building',
          'JSON schema for transaction',
        ]}
        fund={'Fund12'}
        status={'Voting'}
      />
      <CardLink
        title="Maintaining Mesh SDK, community support and content creation to onboard developers"
        desc="Maintenance and operations of Mesh SDK, community support and content creation, in order to onboard developers and users to the Cardano blockchain ecosystem."
        url="https://cardano.ideascale.com/c/idea/122471"
        completed={[]}
        tobecompleted={[
          `Provide community support`,
          `Resolve GitHub issues`,
          `Create tutorials and documentation`,
          `Create workshops and live coding sessions`,
        ]}
        fund={'Fund12'}
        status={'Voting'}
      />

      <CardLink
        title="Aiken Open-Source Smart Contract Library"
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
        fund={'Fund11'}
        status={'In Progress'}
      />

      <CardLink
        title="Sustain & Maintain MeshJS"
        desc="This proposal enables implementations not limited to Voltaire features, Hydra & Aiken integration, and data providers integrations. Including bounties for issues, features, and learning materials."
        url="https://projectcatalyst.io/funds/11/cardano-open-developers/sustain-and-maintain-meshjs"
        completed={[
          'Lower-level APIs completed',
          'Technical documentation released',
          'Resolved numerous reported GitHub issues',
          'Active Discord engagement to help developers',
          'Transaction building support for Hydra apps',
        ]}
        tobecompleted={[
          'Plutus version 3 integration',
          'Revamped/refactored transaction and utilities class',
          'Conway features',
        ]}
        fund={'Fund11'}
        status={'In Progress'}
      />

      <CardLink
        title="Supporting Open-Source Library Development, Developer Resources & Builder Community"
        desc="To guarantee and ensure sustainability of a team dedicated to maintaining and developing one of the best open-source libraries on Cardano, providing devs with something easy-to-use, fun and productive."
        url="https://projectcatalyst.io/funds/10/f10-osde-open-source-dev-ecosystem/meshjs-sdk-operations-supporting-open-source-library-development-developer-resources-and-builder-community"
        completed={[
          'Lower-level APIs core functionality',
          'Mesh PBL course content',
          'Workshops and live coding',
          'Community Q&A support',
          'Demos and tutorials repository',
        ]}
        tobecompleted={['Mesh PBL Season #1', 'Student projects']}
        fund={'Fund10'}
        status={'In Progress'}
      />
    </>
  );
}

function CardLink({
  title,
  desc,
  url,
  completed,
  tobecompleted,
  fund,
  status,
}) {
  return (
    <div className="block max-w-sm p-6 bg-white border border-gray-200 rounded-lg shadow dark:bg-gray-800 dark:border-gray-700">
      <h5 className="mb-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
        {title}
      </h5>
      <div className="flex gap-2 mb-2">
        <span className="bg-green-100 text-green-800 text-xs font-medium me-2 px-2.5 py-0.5 rounded dark:bg-green-900 dark:text-green-300">
          {status}
        </span>
        <span className="bg-blue-100 text-blue-800 text-xs font-medium me-2 px-2.5 py-0.5 rounded dark:bg-blue-900 dark:text-blue-300">
          {fund}
        </span>
      </div>
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
