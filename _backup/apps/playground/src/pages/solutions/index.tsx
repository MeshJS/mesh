import type { NextPage } from "next";

import HeaderAndCards from "~/components/layouts/header-and-cards";
import Metatags from "~/components/site/metatags";
import { linksSolutions, metaSolutions } from "~/data/links-solutions";

const ReactPage: NextPage = () => {
  return (
    <>
      <Metatags title={metaSolutions.title} description={metaSolutions.desc} />
      <HeaderAndCards
        headerTitle={metaSolutions.title}
        headerParagraph={metaSolutions.desc}
        listCards={linksSolutions}
      />
    </>
  );
};

export default ReactPage;
