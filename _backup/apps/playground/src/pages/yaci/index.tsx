import type { NextPage } from "next";

import HeroLogoTwoSectionsLinks from "~/components/sections/hero-logo-two-sections-links";
import Metatags from "~/components/site/metatags";
import { linksYaci, metaYaci } from "~/data/links-yaci";

const ReactPage: NextPage = () => {
  return (
    <>
      <Metatags title={metaYaci.title} description={metaYaci.desc} />
      <HeroLogoTwoSectionsLinks
        logo={
          <>
            <img
              className="mx-auto w-36 object-contain"
              src="/providers/yaci.png"
              alt="Yaci logo"
            />
          </>
        }
        title="Customizable Cardano devnet for enabling faster iterations"
        description="Custom Cardano devnet that can be created and reset in seconds using the user-friendly Yaci CLI. This allows for rapid iteration and experimentation, tailored to specific needs through flexible configuration options. The default devnet is optimized for speed, with customizable parameters for various testing scenarios. Integrated tools like the lightweight chain indexer Yaci Store and the browser-based Yaci Viewer enhance transaction building and submission. Yaci DevKit's compatibility with Blockfrost API endpoints ensures seamless integration with client SDKs."
        links={linksYaci}
      />
    </>
  );
};

export default ReactPage;
