import type { NextPage } from "next";

import HeaderAndCards from "~/components/layouts/header-and-cards";
import Metatags from "~/components/site/metatags";
import { linksTxParser, metaTxParser } from "~/data/links-txparser";

const ReactPage: NextPage = () => {
  return (
    <>
      <Metatags title={metaTxParser.title} description={metaTxParser.desc} />
      <HeaderAndCards
        headerTitle={metaTxParser.title}
        headerParagraph={metaTxParser.desc}
        listCards={linksTxParser}
      />
    </>
  );
};

export default ReactPage;
