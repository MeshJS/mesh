import React from "react";
import NextLink from "next/link";

import Icon from "../icon";

export default function Link({
  children,
  href,
  className,
  icon,
  target,
}: {
  children: React.ReactNode;
  href: string;
  className?: string;
  icon?: any;
  target?: string;
}) {
  return (
    <NextLink
      href={href}
      className={`${className} ${typeof children == "string" && "text-gray-900 no-underline hover:underline dark:text-gray-100"} `}
      target={target ? target : href.startsWith("http") ? "_blank" : "_self"}
      rel="noreferrer"
    >
      <Icon icon={icon} className="mr-2 h-4 w-4" />
      {children}
    </NextLink>
  );
}
