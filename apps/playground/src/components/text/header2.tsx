import React from "react";

import Icon from "../icon";

export default function Header2({
  children,
  heroicon,
}: {
  children: React.ReactNode;
  heroicon?: any;
}) {
  if (heroicon) {
    return (
      <Title>
        <div className="flex items-center">
          <div className="mr-4 p-2">
            <Icon icon={heroicon} className="h-16 w-16" />
          </div>
          <span>{children}</span>
        </div>
      </Title>
    );
  }
  return <Title>{children}</Title>;
}

function Title({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-4 text-4xl font-extrabold tracking-tight text-gray-900 dark:text-white">
      {children}
    </h2>
  );
}
