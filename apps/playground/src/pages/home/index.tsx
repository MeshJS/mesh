import { useEffect, useState } from "react";

import HeroTwoSections from "~/components/sections/hero-two-sections";

export default function HomePage() {
  const [isSSR, setIsSSR] = useState(true);
  useEffect(() => {
    setIsSSR(false);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <HeroTwoSections
        title="Build applications on Cardano with ease"
        description="Mesh is a TypeScript open-source library providing numerous tools to easily build powerful dApps on the Cardano blockchain."
        link={{ label: "Get started", href: "/getting-started" }}
        image={
          <div className="col-span-6 hidden lg:block h-96">
            {!isSSR ? (
              <video className="w-full" autoPlay muted>
                <source src="/home/starter-template-cli.mp4" type="video/mp4" />
                Your browser does not support the video tag.
              </video>
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
        }
        // children={<SendPayment />}
      />
    </div>
  );
}
