import React from "react";

import Icon from "~/components/icon";
import Link from "~/components/link";

export default function SubmenuItem({
  title,
  icon,
  link,
}: {
  title: string;
  icon: any;
  link: string;
}) {
  return (
    <li>
      <Link
        href={link}
        className="flex w-full items-center px-4 py-2 hover:text-black dark:hover:text-white"
        target={link.startsWith("http") ? "_blank" : "_self"}
      >
        <Icon icon={icon} className="mr-2 w-4 h-4" />
        {title}
      </Link>
    </li>
  );
}
