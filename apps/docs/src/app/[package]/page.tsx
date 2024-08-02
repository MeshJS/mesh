"use client";
import { useRouteContext } from "@/contexts/route-context";
import IntroTransaction from "./transactions";
import { useEffect } from "react";
import IntroWallets from "./wallets";
import IntroContracts from "./contracts";
import IntroProviders from "./providers";
import IntroCommon from "./common";
import IntroCoreCsl from "./core-csl";

export default function PackagePage({
  params,
}: {
  params: { package: string };
}) {
  const { setCurrentRoute } = useRouteContext();

  useEffect(() => {
    setCurrentRoute(params.package);
  }, [params]);

  if (params.package === "transactions") {
    return <IntroTransaction />;
  }
  if (params.package === "wallets") {
    return <IntroWallets />;
  }
  if (params.package === "contracts") {
    return <IntroContracts />;
  }
  if (params.package === "providers") {
    return <IntroProviders />;
  }
  if (params.package === "common") {
    return <IntroCommon />;
  }
  if (params.package === "core-csl") {
    return <IntroCoreCsl />;
  }

  return <>package</>;
}
