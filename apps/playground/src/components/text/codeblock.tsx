import { useEffect, useState } from "react";
import { DocumentDuplicateIcon } from "@heroicons/react/24/solid";
import Highlight from "react-highlight";
import toast from "react-hot-toast";

import { useClipboard } from "~/hooks/useCopyClipboard";

export default function Codeblock({
  data,
  language = "language-js",
  isJson = false,
}: {
  data: any;
  language?: string;
  isJson?: boolean;
}) {
  const [isMounted, setIsMounted] = useState(false);

  const { onCopy } = useClipboard(
    isJson 
      ? JSON.stringify(data, null, 2) 
      : data
        .split('\n')
        .map(line => line.replace(/^\$\s*/, ''))
        .join('\n')
  );

  function copy() {
    onCopy();
    toast("Copied to clipboard");
  }

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return null;
  }

  return (
    <div className="relative max-h-96 overflow-auto">
      <button
        type="button"
        className="absolute right-1 top-1 rounded-lg border border-neutral-300 bg-white px-1 py-1 text-sm font-medium text-neutral-900 hover:bg-neutral-100 focus:ring-4 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white dark:hover:border-neutral-600 dark:hover:bg-neutral-700 dark:focus:ring-neutral-700"
        onClick={() => copy()}
      >
        <DocumentDuplicateIcon className="h-4 w-4" />
      </button>
      <Highlight className={`${language}`}>
        {isJson ? JSON.stringify(data, null, 2) : data}
      </Highlight>
    </div>
  );
}
