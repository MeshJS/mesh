import type { NextPage } from "next";

import HeaderAndCards from "~/components/layouts/header-and-cards";
import Metatags from "~/components/site/metatags";
import { linksResources, metaResources } from "~/data/links-resources";

const ReactPage: NextPage = () => {
  return (
    <>
      <Metatags title={metaResources.title} description={metaResources.desc} />
      <HeaderAndCards
        headerTitle={metaResources.title}
        headerParagraph={metaResources.desc}
        listCards={linksResources}
      />
    </>
  );
};

export default ReactPage;
