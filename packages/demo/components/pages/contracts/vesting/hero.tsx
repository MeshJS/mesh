import { LockClosedIcon } from '@heroicons/react/24/solid';

export default function Hero() {
  return (
    <>
      <header className="mb-4 lg:mb-6">
        <h2 className="mb-4 text-4xl tracking-tight font-extrabold text-gray-900 dark:text-white">
          <div className="flex items-center">
            <div className="p-2 mr-4">
              <LockClosedIcon className="w-16 h-16" />
            </div>
            <span>Vesting</span>
          </div>
        </h2>
        <p className="mb-8 font-light text-gray-500 sm:text-xl dark:text-gray-400">
          Vesting contract is a smart contract that locks up funds for a period
          of time and allows the owner to withdraw the funds after the lockup
          period.
        </p>
      </header>
      <div className="grid grid-cols-1 px-4 lg:grid-cols-3 lg:gap-4 pb-16">
        <div className="col-span-2">
          <p>
            When a new employee joins an organization, they typically receive a
            promise of compensation to be disbursed after a specified duration
            of employment. This arrangement often involves the organization
            depositing the funds into a vesting contract, with the employee
            gaining access to the funds upon the completion of a predetermined
            lockup period. Such a system is designed to incentivize the employee
            to remain with the organization for the agreed-upon duration,
            thereby fostering commitment and stability within the workforce.
          </p>
          <p>
            Through the utilization of vesting contracts, organizations
            establish a mechanism to encourage employee retention by linking
            financial rewards to tenure. By requiring employees to wait until
            the end of a designated lockup period before accessing their
            promised funds, the organization promotes loyalty and long-term
            engagement among its workforce. This approach serves to align the
            interests of both the employee and the organization, fostering
            mutual investment in each other's success and contributing to the
            establishment of a stable and committed workforce.
          </p>
          <p>
            There are 2 actions (or endpoints) available to interact with this
            smart contract:
          </p>
          <ul>
            <li>deposit asset</li>
            <li>withdraw asset</li>
          </ul>
          {/* <p>
            Do check out the{' '}
            <Link href="/guides/custom-marketplace">guide</Link> and the{' '}
            <Link href="/starter-templates">marketplace starter kit</Link> that
            might help you get started. This contract is written in{' '}
            <a
              href="https://pluts.harmoniclabs.tech/"
              target="_blank"
              rel="noreferrer"
            >
              plu-ts
            </a>
            , you can{' '}
            <a
              href="https://github.com/MeshJS/mesh/blob/main/packages/contracts/src/marketplace/contract.ts"
              target="_blank"
              rel="noreferrer"
            >
              view the contract on GitHub
            </a>
            .
          </p> */}
        </div>
      </div>
    </>
  );
}
