import { useRouter } from "next/router";
import { LinkIcon } from "@heroicons/react/24/solid";
import toast from "react-hot-toast";
import { Element } from "react-scroll";

import { rootUrl } from "~/data/site";
import { useClipboard } from "~/hooks/useCopyClipboard";

export default function TwoColumnsScroll({
  sidebarTo,
  title,
  leftSection,
  rightSection,
}: {
  sidebarTo: string;
  title: string;
  leftSection: JSX.Element;
  rightSection?: JSX.Element;
}) {
  const { pathname } = useRouter();
  const { onCopy } = useClipboard(`${rootUrl}${pathname}#${sidebarTo}`);

  function copy() {
    onCopy();
    toast("URL copied to clipboard");
  }

  return (
    <Element name={sidebarTo}>
      <div className="flex flex-row justify-start space-x-4">
        <h3>{title}</h3>
        <button type="button" className="h-8" onClick={() => copy()}>
          <LinkIcon className="h-5 w-5" />
        </button>
      </div>
      <div className="grid grid-cols-1 md:px-4 pb-16 lg:grid-cols-2 lg:gap-16">
        <div className="col-span-1 xl:col-auto">{leftSection}</div>
        {rightSection && <div className="col-span-1">{rightSection}</div>}
      </div>
    </Element>
  );
}
