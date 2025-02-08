import type { NextPage } from "next";
import { useEffect } from "react";

import { initPolkadotApi } from "@meshsdk/polkadot";

import HeroLogoTwoSectionsLinks from "~/components/sections/hero-logo-two-sections-links";
import Metatags from "~/components/site/metatags";
import SvgPolkadot from "~/components/svgs/polkadot";
import { linksPolkadot, metaPolkadot } from "~/data/links-polkadot";
import { useDarkmode } from "~/hooks/useDarkmode";

const ReactPage: NextPage = () => {
  const isDark = useDarkmode((state) => state.isDark);

  useEffect(() => {
    async function test() {
      const api = await initPolkadotApi({
        provider: { endpoint: "wss://rpc.polkadot.io" },
      });
      console.log(api.genesisHash.toHex());
    }
    test();
  }, []);

  return (
    <>
      <Metatags title={metaPolkadot.title} description={metaPolkadot.desc} />
      <HeroLogoTwoSectionsLinks
        logo={
          <>
            <SvgPolkadot
              className={`mx-auto w-36 object-contain ${isDark ? "text-white" : "text-black"} w-8`}
            />
          </>
        }
        title="A blockchain network of networks"
        description="Polkadot is a decentralized, nominated proof-of-stake blockchain with smart contract functionality. The cryptocurrency native to the blockchain is the DOT. It is designed to allow blockchains to exchange messages and perform transactions with each other without a trusted third-party."
        links={linksPolkadot}
      />
    </>
  );
};

export default ReactPage;
