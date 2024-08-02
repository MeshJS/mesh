import type { NextPage } from "next";

import HeaderAndCards from "~/components/layouts/header-and-cards";
import Metatags from "~/components/site/metatags";
import { linksGetStarted, metaGetStarted } from "~/data/links-get-started";

const ReactPage: NextPage = () => {
  return (
    <>
      <Metatags
        title={metaGetStarted.title}
        description={metaGetStarted.desc}
      />
      <HeaderAndCards
        headerTitle={metaGetStarted.title}
        headerParagraph={metaGetStarted.desc}
        listCards={linksGetStarted}
      />
    </>
  );
};

export default ReactPage;
