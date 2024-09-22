import Image from "next/image";
import React from "react";

import Link from "next/link";
import Icon from "@/components/atom/icon/Icon";

export default function NewContentHeader({
  title,
  loading,
  callback,
}: {
  title: string;
  loading: boolean;
  callback: () => Promise<void>;
}) {
  return (
    <div className="border-b p-4">
      <div className="container flex justify-between items-center p-1.5">
        <div className="flex space-x-2 text-black items-center">
          <Link href="/">
            <Icon />
          </Link>
          <p>{title}</p>
        </div>
        <button
          className="bg-emerald-500 rounded-lg cursor-pointer text-white p-3"
          disabled={loading}
          onClick={callback}>
          {loading ? "Creating..." : "Create Content"}
        </button>
      </div>
    </div>
  );
}
