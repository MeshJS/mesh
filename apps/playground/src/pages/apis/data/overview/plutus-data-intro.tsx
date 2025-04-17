import React from "react";

import TwoColumnsScroll from "~/components/sections/two-columns-scroll";

export default function PlutusDataIntro() {
  return (
    <TwoColumnsScroll
      sidebarTo="PlutusDataIntro"
      title="Use of Data in Cardano"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        Cardano data and information is usually communicated in{" "}
        <code>CBOR</code> encoding format, which can be decoded into{" "}
        <code>JSON</code> representation.
      </p>
      <p>
        On top of the 2, Mesh also provides the <code>Data</code> type which get
        rids of unnecessary wrappers.
      </p>
      <p>
        Mesh supports building data for your app in all 3 different formats.{" "}
      </p>
      <div>
        <li>
          <code>Mesh</code> - the <code>Data</code> type
        </li>
        <li>
          <code>JSON</code>{" "}
        </li>
        <li>
          <code>CBOR</code>{" "}
        </li>
      </div>
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
