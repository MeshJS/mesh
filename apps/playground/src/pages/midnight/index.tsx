import type { NextPage } from "next";

import HeroLogoTwoSectionsLinks from "~/components/sections/hero-logo-two-sections-links";
import Metatags from "~/components/site/metatags";
import SvgMidnight from "~/components/svgs/midnight";
import { linksMidnight, metaMidnight } from "~/data/links-midnight";
import { useDarkmode } from "~/hooks/useDarkmode";

const ReactPage: NextPage = () => {
  const isDark = useDarkmode((state) => state.isDark);

  return (
    <>
      <Metatags title={metaMidnight.title} description={metaMidnight.desc} />
      <HeroLogoTwoSectionsLinks
        logo={
          <>
            <SvgMidnight
              className={`mx-auto w-36 object-contain ${isDark ? "text-white" : "text-black"}`}
            />
          </>
        }
        title="Empowering data protection apps"
        description="Midnight introduces data protection to the blockchain, enabling organizations to build regulation-friendly applications that empower users to retain control over their own information. By leveraging zero-knowledge technology, Midnight provides a platform for innovative business models, revolutionizing how data is managed and protected."
        links={linksMidnight}
      />
    </>
  );
};

export default ReactPage;
