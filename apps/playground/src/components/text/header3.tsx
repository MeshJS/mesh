import React from "react";

export default function Header3({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-4 text-xl font-light tracking-tight text-gray-900 md:text-4xl dark:text-white">
      {children}
    </h2>
  );
}
