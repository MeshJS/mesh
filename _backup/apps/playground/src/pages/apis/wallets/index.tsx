import type { NextPage } from "next";

import HeaderAndCards from "~/components/layouts/header-and-cards";
import Metatags from "~/components/site/metatags";
import { linksWallets, metaWallets } from "~/data/links-wallets";

const ReactPage: NextPage = () => {
  return (
    <>
      <Metatags title={metaWallets.title} description={metaWallets.desc} />
      <HeaderAndCards
        headerTitle={metaWallets.title}
        headerParagraph={metaWallets.desc}
        listCards={linksWallets}
      />
    </>
  );
};

export default ReactPage;
