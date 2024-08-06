import React from "react";
import NextLink from "next/link";

export default function Link({
  children,
  href,
  className,
  icon,
}: {
  children: React.ReactNode;
  href: string;
  className?: string;
  icon?: any;
}) {
  return (
    <NextLink
      href={href}
      className={className}
      target={href.startsWith("http") ? "_blank" : "_self"}
      rel="noreferrer"
    >
      {icon && React.createElement(icon, { className: "mr-2 w-4 h-4" })}
      {children}
    </NextLink>
  );
}
