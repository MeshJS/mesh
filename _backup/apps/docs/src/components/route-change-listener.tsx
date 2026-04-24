"use client";

import { useRouteContext } from "@/contexts/route-context";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

export function RouteChangeListener() {
  const pathname = usePathname();
  const { setCurrentRoute } = useRouteContext();

  useEffect(() => {
    const currentPackage = pathname.split("/")[1];

    if (currentPackage) {
      setCurrentRoute(currentPackage);
    } else {
      setCurrentRoute("");
    }
  }, [pathname]);

  return <></>;
}
