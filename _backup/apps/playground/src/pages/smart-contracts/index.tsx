import type { NextPage } from "next";

import HeaderAndCards from "~/components/layouts/header-and-cards";
import Metatags from "~/components/site/metatags";
import {
  linksSmartContracts,
  metaSmartContract,
} from "~/data/links-smart-contracts";

const ReactPage: NextPage = () => {
  return (
    <>
      <Metatags
        title={metaSmartContract.title}
        description={metaSmartContract.desc}
      />
      <HeaderAndCards
        headerTitle={metaSmartContract.title}
        headerParagraph={metaSmartContract.desc}
        listCards={linksSmartContracts}
      />
    </>
  );
};

export default ReactPage;
