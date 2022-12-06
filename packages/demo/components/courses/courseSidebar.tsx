import { ChevronDownIcon } from '@heroicons/react/24/solid';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

export default function CoursesSidebar({ root, menu }) {
  return (
    <aside className="fixed top-0 left-0 z-20 flex-col flex-shrink-0 pt-16 w-64 h-full duration-75 lg:flex transition-width">
      <div className="flex relative flex-col flex-1 pt-0 min-h-0 bg-white border-r border-gray-200 dark:bg-gray-800 dark:border-gray-700">
        <div className="flex overflow-y-auto flex-col flex-1 pt-5 pb-4">
          <div className="flex-1 px-3 space-y-1 bg-white divide-y divide-gray-200 dark:bg-gray-800 dark:divide-gray-700">
            <ul className="pb-2 space-y-2">
              {menu.map((item, i) => {
                if (item.type === 'submenu') {
                  return <MenuSubmenu menuItem={item} root={root} key={i} />;
                } else {
                  return <MenuLink menuItem={item} root={root} key={i} />;
                }
              })}
            </ul>
          </div>
        </div>
      </div>
    </aside>
  );
}

function MenuLink({ menuItem, root, key = 0, itemParent = undefined }) {
  let style =
    'flex items-center p-2 text-base font-normal text-gray-900 rounded-lg hover:bg-gray-100 group dark:text-gray-200 dark:hover:bg-gray-700';
  if (itemParent) {
    style =
      'flex items-center p-2 pl-11 text-base font-normal text-gray-900 rounded-lg transition duration-75 group hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700';
  }
  style += ` cursor-pointer`;

  const router = useRouter();
  if (router.pathname.includes(menuItem.url)) {
    style += ' bg-gray-100 dark:bg-gray-700';
  }

  let url = root;
  if (itemParent !== undefined) {
    // @ts-ignore
    url += `/${itemParent.url}`;
  }
  url += `/${menuItem.url}`;

  return (
    <li key={key}>
      <Link href={url}>
        <div className={style}>
          <span>{menuItem.label}</span>
        </div>
      </Link>
    </li>
  );
}

function MenuSubmenu({ menuItem, root }) {
  const [showSubmenu, setShowSubmenu] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (router.pathname.includes(menuItem.url)) {
      setShowSubmenu(true);
    }
  }, []);

  return (
    <li>
      <button
        type="button"
        className="flex items-center p-2 w-full text-base font-normal text-gray-900 rounded-lg transition duration-75 group hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
        onClick={() => {
          setShowSubmenu(!showSubmenu);
        }}
      >
        <span className="flex-1 ml-3 text-left whitespace-nowrap">
          {menuItem.label}
        </span>
        <ChevronDownIcon className="w-6 h-6" />
      </button>
      <ul className={`${!showSubmenu && 'hidden'} py-2 space-y-2 `}>
        {menuItem.children.map((item, i) => {
          return MenuLink({
            menuItem: item,
            root: root,
            key: i,
            itemParent: menuItem,
          });
        })}
      </ul>
    </li>
  );
}
