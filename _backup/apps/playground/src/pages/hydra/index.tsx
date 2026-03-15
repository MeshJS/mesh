import type { NextPage } from "next";

import HeroLogoTwoSectionsLinks from "~/components/sections/hero-logo-two-sections-links";
import Metatags from "~/components/site/metatags";
import SvgHydra from "~/components/svgs/hydra";
import { linksHydra, metaHydra } from "~/data/links-hydra";
import { useDarkmode } from "~/hooks/useDarkmode";

const ReactPage: NextPage = () => {
  const isDark = useDarkmode((state) => state.isDark);

  return (
    <>
      <Metatags title={metaHydra.title} description={metaHydra.desc} />
      <HeroLogoTwoSectionsLinks
        logo={
          <>
            <SvgHydra
              className={`mx-auto w-36 object-contain ${isDark ? "text-white" : "text-black"}`}
            />
          </>
        }
        title="Layer 2 scaling solution"
        description="Scaling solution for Cardano that increases transaction throughput and ensures cost efficiency while maintaining rigorous security."
        links={linksHydra}
      />
    </>
  );
};

export default ReactPage;
