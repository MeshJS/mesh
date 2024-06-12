import { DocumentTextIcon } from '@heroicons/react/24/solid';
import Link from 'next/link';

export default function Hero() {
  return (
    <>
      <header className="mb-4 lg:mb-6">
        <h2 className="mb-4 text-4xl tracking-tight font-extrabold text-gray-900 dark:text-white">
          <div className="flex items-center">
            <div className="p-2 mr-4">
              <DocumentTextIcon className="w-16 h-16" />
            </div>
            <span>Coupon Bond Guaranteed</span>
          </div>
        </h2>
        <p className="mb-8 font-light text-gray-500 sm:text-xl dark:text-gray-400">
          Debt agreement between Lender and Borrower.
        </p>
      </header>
      <div className="grid grid-cols-1 px-4 lg:grid-cols-3 lg:gap-4 pb-16">
        <div className="col-span-2">
          <p>
            Debt agreement between Lender and Borrower. Lender will advance the
            Principal amount at the beginning of the contract, and the Borrower
            will pay back Interest instalment every 30 slots and the Principal
            amount by the end of 3 instalments. The debt is backed by a
            collateral provided by the Guarantor which will be refunded as long
            as the Borrower pays back on time.
          </p>
          <p>
            There are 2 actions (or endpoints) available to interact with this
            smart contract:
          </p>
          <ul>
            {/* <li>deposit asset</li>
            <li>withdraw asset</li> */}
          </ul>
          <p>
            Both on-chain and off-chain codes are open-source and available on{' '}
            <Link href="https://github.com/MeshJS/mesh/tree/main/packages/contracts/src/coupon-bond-guaranteed">
              Mesh Github Repository
            </Link>
            .
          </p>
        </div>
      </div>
    </>
  );
}
