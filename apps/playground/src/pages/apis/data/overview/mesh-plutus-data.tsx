import React from "react";
import Link from "~/components/link";

import TwoColumnsScroll from "~/components/sections/two-columns-scroll";

export default function MeshPlutusData() {
  return (
    <TwoColumnsScroll
      sidebarTo="MeshPlutusData"
      title="Mesh Data Type"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        Mesh <code>Data</code> type is best used when you want to quickly and
        easily compose your data types.
      </p>
      <Link href="/apis/data/mesh">
        <button>Learn more</button>
      </Link>
    </>
  );
}

function Right() {
  return (
    <>
      {/* <ADAValue />
      <TokenValue />
      <MultipleValue /> */}
    </>
  );
}
