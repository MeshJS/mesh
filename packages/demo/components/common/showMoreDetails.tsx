import { ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/solid';
import { useState } from 'react';

export default function ShowMoreDetails({ children, label = 'Show details' }) {
  const [show, setShow] = useState<boolean>(false);
  return (
    <>
      <div className='mb-8'>
        <button
          type="button"
          className="flex justify-between items-center py-5 w-full font-medium text-left text-gray-500 border-b border-gray-200 dark:border-gray-700 dark:text-gray-400"
          onClick={() => setShow(!show)}
        >
          <span>{label}</span>
          {show ? (
            <ChevronDownIcon className="w-6 h-6 shrink-0" />
          ) : (
            <ChevronUpIcon className="w-6 h-6 shrink-0" />
          )}
        </button>
      </div>
      <div
        id="accordion-flush-body-3"
        className={!show ? 'hidden' : ''}
        aria-labelledby="accordion-flush-heading-3"
      >
        <div className="py-5 border-b border-gray-200 dark:border-gray-700">
          {children}
        </div>
      </div>
    </>
  );
}
