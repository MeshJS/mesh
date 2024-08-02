import React from "react";

export default function Button({
  children,
  isDarkMode = false,
  hideMenuList = false,
  setHideMenuList,
}: {
  children: React.ReactNode;
  isDarkMode?: boolean;
  hideMenuList?: boolean;
  setHideMenuList?: (hideMenuList: boolean) => void;
}) {
  return (
    <button
      className={`ui-mr-menu-list ui-flex ui-w-60 ui-items-center ui-justify-center ui-rounded-t-md ui-border ui-px-4 ui-py-2 ui-text-lg ui-font-normal ui-shadow-sm ${isDarkMode ? `ui-bg-neutral-950	ui-text-neutral-50` : `ui-bg-neutral-50	ui-text-neutral-950`}`}
      onClick={() => setHideMenuList && setHideMenuList(!hideMenuList)}
    >
      {children}
    </button>
  );
}
