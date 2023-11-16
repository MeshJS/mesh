import { LinkIcon } from '@heroicons/react/24/solid';
import { Element } from 'react-scroll';
import { useClipboard } from '../../hooks/useCopyClipboard';
import { useRouter } from 'next/router';
import { rootUrl } from '../../configs/site';

export default function Section({
  sidebarTo,
  header,
  contentFn,
  isH3 = false,
  badge = <></>,
}) {
  const { pathname } = useRouter();
  const { value, onCopy, hasCopied } = useClipboard(
    `${rootUrl}${pathname}#${sidebarTo}`
  );

  return (
    <Element name={sidebarTo}>
      {isH3 ? (
        <div className="flex flex-col sm:flex-row sm:justify-start sm:space-x-4">
          <h3>
            {header}
            {badge && <span className="ml-2">{badge}</span>}
          </h3>
          <button type="button" className="h-8" onClick={() => onCopy()}>
            <LinkIcon className="w-5 h-5" />
          </button>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row sm:justify-start sm:space-x-4">
          <h2>{header}</h2>
          <button type="button" className="h-8" onClick={() => onCopy()}>
            <LinkIcon className="w-5 h-5" />
          </button>
        </div>
      )}
      <div className="px-4 pb-16 lg:w-[90%] xl:w-[80%]">
        <div>{contentFn}</div>
      </div>
    </Element>
  );
}
