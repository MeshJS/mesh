import React from "react";
import Link from "next/link";

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
        className="hover:text-primary-600 dark:hover:text-primary-500 flex w-full items-center px-4 py-2"
      >
        {icon && React.createElement(icon, { className: "mr-2 w-4 h-4" })}
        {title}
      </Link>
    </li>
  );
}
