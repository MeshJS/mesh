import type { NextPage } from "next";

import HeaderAndCards from "~/components/layouts/header-and-cards";
import Metatags from "~/components/site/metatags";
import { linksReact, metaReact } from "~/data/links-react";

const ReactPage: NextPage = () => {
  return (
    <>
      <Metatags title={metaReact.title} description={metaReact.desc} />
      <HeaderAndCards
        headerTitle={metaReact.title}
        headerParagraph={metaReact.desc}
        listCards={linksReact}
      />
    </>
  );
};

export default ReactPage;
