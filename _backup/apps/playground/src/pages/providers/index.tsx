import type { NextPage } from "next";

import HeaderAndCards from "~/components/layouts/header-and-cards";
import Metatags from "~/components/site/metatags";
import { linksProviders, metaProviders } from "~/data/links-providers";

const ReactPage: NextPage = () => {
  return (
    <>
      <Metatags title={metaProviders.title} description={metaProviders.desc} />
      <HeaderAndCards
        headerTitle={metaProviders.title}
        headerParagraph={metaProviders.desc}
        listCards={linksProviders}
      />
    </>
  );
};

export default ReactPage;
