import type { NextPage } from "next";

import HeaderAndCards from "~/components/layouts/header-and-cards";
import Metatags from "~/components/site/metatags";
import { linksTransactions, metaTransaction } from "~/data/links-transactions";

const ReactPage: NextPage = () => {
  return (
    <>
      <Metatags
        title={metaTransaction.title}
        description={metaTransaction.desc}
      />
      <HeaderAndCards
        headerTitle={metaTransaction.title}
        headerParagraph={metaTransaction.desc}
        listCards={linksTransactions}
      />
    </>
  );
};

export default ReactPage;
