import type { NextPage } from "next";

import HeaderAndCards from "~/components/layouts/header-and-cards";
import Metatags from "~/components/site/metatags";
import { linksData, metaData } from "~/data/links-data";

const ReactPage: NextPage = () => {
  return (
    <>
      <Metatags title={metaData.title} description={metaData.desc} />
      <HeaderAndCards
        headerTitle={metaData.title}
        headerParagraph={metaData.desc}
        listCards={linksData}
      />
    </>
  );
};

export default ReactPage;
