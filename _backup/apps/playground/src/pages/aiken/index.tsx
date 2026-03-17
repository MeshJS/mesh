import type { NextPage } from "next";

import HeroLogoTwoSectionsLinks from "~/components/sections/hero-logo-two-sections-links";
import Metatags from "~/components/site/metatags";
import { linksAiken, metaAiken } from "~/data/links-aiken";

const ReactPage: NextPage = () => {
  return (
    <>
      <Metatags title={metaAiken.title} description={metaAiken.desc} />
      <HeroLogoTwoSectionsLinks
        logo={
          <>
            <img
              className="mx-auto w-36 object-contain dark:hidden"
              src="/images/aiken/logo-dark.png"
              alt="Aiken logo"
            />
            <img
              className="mx-auto hidden w-36 object-contain dark:block"
              src="/images/aiken/logo-light.png"
              alt="Aiken logo dark"
            />
          </>
        }
        title="A programming language and toolkit for developing smart contracts"
        description="Aiken is a functional programming language created for Cardano smart contract development. It prioritizes on-chain execution and offers a user-friendly approach for building secure and efficient smart contracts, making it a valuable choice for developers aiming to create robust on-chain applications."
        links={linksAiken}
      />
    </>
  );
};

export default ReactPage;
