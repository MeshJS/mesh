import React from "react";

export default function ButtonDropdown({
  children,
  isDarkMode = false,
  hideMenuList = false,
  setHideMenuList,
  onMouseEnter,
  onMouseLeave,
}: {
  children: React.ReactNode;
  isDarkMode?: boolean;
  hideMenuList?: boolean;
  setHideMenuList?: (hideMenuList: boolean) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  return (
    <button
      className={`mesh-mr-menu-list mesh-flex mesh-w-60 mesh-items-center mesh-justify-center mesh-rounded-t-md mesh-border mesh-px-4 mesh-py-2 mesh-text-lg mesh-font-normal mesh-shadow-sm ${isDarkMode ? `mesh-bg-neutral-950	mesh-text-neutral-50` : `mesh-bg-neutral-50	mesh-text-neutral-950`}`}
      onClick={() => setHideMenuList && setHideMenuList(!hideMenuList)}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </button>
  );
}
