import { DocumentDuplicateIcon } from '@heroicons/react/24/solid';
import Highlight from 'react-highlight';
import { useClipboard } from '../../hooks/useCopyClipboard';

export default function Codeblock({
  data,
  language = 'language-js',
  isJson = true,
}) {
  const { value, onCopy, hasCopied } = useClipboard(
    isJson ? JSON.stringify(data, null, 2) : data
  );

  return (
    <div className="max-h-96 overflow-auto relative not-format mb-4">
      <button
        type="button"
        className="text-gray-900 bg-white border border-gray-300 hover:bg-gray-100 focus:ring-4 font-medium rounded-lg text-sm px-1 py-1 dark:bg-gray-800 dark:text-white dark:border-gray-600 dark:hover:bg-gray-700 dark:hover:border-gray-600 dark:focus:ring-gray-700 absolute right-1 top-1"
        onClick={() => onCopy()}
      >
        <DocumentDuplicateIcon className="w-4 h-4" />
      </button>
      <pre>
        {/* {language == 'language-js' && (
          <Highlight className={language}>
            {isJson ? JSON.stringify(data, null, 2) : data}
          </Highlight>
        )}
        {language == 'language-hs' && (
          <Highlight className={language}>
            {isJson ? JSON.stringify(data, null, 2) : data}
          </Highlight>
        )} */}
        <Highlight className={language}>
          {isJson ? JSON.stringify(data, null, 2) : data}
        </Highlight>
      </pre>
    </div>
  );
}
