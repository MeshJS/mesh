import { useCallback, useEffect, useState } from "react";
import copy from "copy-to-clipboard";

export interface UseClipboardOptions {
  timeout?: number;
  format?: string;
}

export function useClipboard(
  text: string,
  optionsOrTimeout: number | UseClipboardOptions = {},
) {
  const [hasCopied, setHasCopied] = useState(false);

  const { timeout = 1500, ...copyOptions } =
    typeof optionsOrTimeout === "number"
      ? { timeout: optionsOrTimeout }
      : optionsOrTimeout;

  const onCopy = useCallback(() => {
    const didCopy = copy(text, copyOptions);
    setHasCopied(didCopy);
  }, [text, copyOptions]);

  useEffect(() => {
    let timeoutId: number | null = null;

    if (hasCopied) {
      timeoutId = window.setTimeout(() => {
        setHasCopied(false);
      }, timeout);
    }

    return () => {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [timeout, hasCopied]);

  return { value: text, onCopy, hasCopied };
}
