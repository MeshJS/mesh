import type { NextPage } from "next";

import HeaderAndCards from "~/components/layouts/header-and-cards";
import Metatags from "~/components/site/metatags";
import { linksFrameworks, metaFrameworks } from "~/data/links-frameworks";

const ReactPage: NextPage = () => {
  return (
    <>
      <Metatags title={metaFrameworks.title} description={metaFrameworks.desc} />
      <HeaderAndCards
        headerTitle={metaFrameworks.title}
        headerParagraph={metaFrameworks.desc}
        listCards={linksFrameworks}
      />
    </>
  );
};

export default ReactPage;
