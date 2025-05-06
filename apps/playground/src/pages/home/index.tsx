import { Suspense, useEffect, useState } from "react";

import HeroTwoSections from "~/components/sections/hero-two-sections";
import Metatags from "~/components/site/metatags";
import SectionFeatures from "./features";
import SectionGetStarted from "./get-started";

export default function HomePage() {
  return (
    <>
      <Metatags />
      <div className="flex flex-col gap-4">
        <HeroTwoSections
          title="Cardano TypeScript SDK"
          description="Mesh is a TypeScript open-source framework and library, providing numerous tools to build Web3 apps."
          // link={{ label: "Catalyst Proposals", href: "/about/catalyst" }}
          // image={<Video />}
          // children={
          //   <Link
          //     href={`/about/catalyst`}
          //     className="mr-3 inline-flex items-center justify-center rounded-lg bg-neutral-700 px-5 py-3 text-center text-base font-medium text-white hover:bg-neutral-800"
          //   >
          //     Catalyst Proposals
          //     <DocumentCheckIcon className="-mr-1 ml-2 h-5 w-5" />
          //   </Link>
          // }
        />
      </div>

      <SectionFeatures />
      <SectionGetStarted />
    </>
  );
}

function Video() {
  const [isSSR, setIsSSR] = useState(true);
  useEffect(() => {
    setIsSSR(false);
  }, []);
  return (
    <div className="col-span-6 hidden h-96 lg:block">
      {!isSSR ? (
        <Suspense fallback={<></>}>
          <video className="w-full" autoPlay muted>
            <source src="/home/starter-template-cli.mp4" type="video/mp4" />
            Your browser does not support the video tag.
          </video>
        </Suspense>
      ) : (
        <>
          <img
            src="/logo-mesh/black/logo-mesh-black-512x512.png"
            className="dark:hidden"
            alt="mockup"
          />
          <img
            src="/logo-mesh/white/logo-mesh-white-512x512.png"
            className="hidden dark:block"
            alt="mockup dark"
          />
        </>
      )}
    </div>
  );
}
