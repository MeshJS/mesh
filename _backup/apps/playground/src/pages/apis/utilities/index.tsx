import type { NextPage } from "next";

import HeaderAndCards from "~/components/layouts/header-and-cards";
import Metatags from "~/components/site/metatags";
import { linksUtilities, metaUtilities } from "~/data/links-utilities";

const ReactPage: NextPage = () => {
  return (
    <>
      <Metatags title={metaUtilities.title} description={metaUtilities.desc} />
      <HeaderAndCards
        headerTitle={metaUtilities.title}
        headerParagraph={metaUtilities.desc}
        listCards={linksUtilities}
      />
    </>
  );
};

export default ReactPage;
