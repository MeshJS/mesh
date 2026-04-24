import type { NextPage } from "next";

import HeaderAndCards from "~/components/layouts/header-and-cards";
import Metatags from "~/components/site/metatags";
import { linksGuides, metaGuides } from "~/data/links-guides";

const ReactPage: NextPage = () => {
  return (
    <>
      <Metatags title={metaGuides.title} description={metaGuides.desc} />
      <HeaderAndCards
        headerTitle={metaGuides.title}
        headerParagraph={metaGuides.desc}
        listCards={linksGuides}
      />
    </>
  );
};

export default ReactPage;
