import type { NextPage } from "next";

import HeaderAndCards from "~/components/layouts/header-and-cards";
import Metatags from "~/components/site/metatags";
import { linksTxbuilder, metaTxbuilder } from "~/data/links-txbuilders";

const ReactPage: NextPage = () => {
  return (
    <>
      <Metatags title={metaTxbuilder.title} description={metaTxbuilder.desc} />
      <HeaderAndCards
        headerTitle={metaTxbuilder.title}
        headerParagraph={metaTxbuilder.desc}
        listCards={linksTxbuilder}
      />
    </>
  );
};

export default ReactPage;
