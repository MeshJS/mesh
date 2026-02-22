import type { NextPage } from "next";

import HeaderAndCards from "~/components/layouts/header-and-cards";
import Metatags from "~/components/site/metatags";
import { linksApi } from "~/data/links-api";

const ReactPage: NextPage = () => {
  return (
    <>
      <Metatags
        title="Mesh API"
        description="From wallet integrations to transaction builders, Mesh makes Web3 development easy with reliable, scalable, and well-engineered APIs & developer tools."
      />
      <HeaderAndCards
        headerTitle="Mesh API"
        headerParagraph="From wallet integrations to transaction builders, Mesh makes Web3 development easy with reliable, scalable, and well-engineered APIs & developer tools."
        listCards={linksApi}
      />
    </>
  );
};

export default ReactPage;
