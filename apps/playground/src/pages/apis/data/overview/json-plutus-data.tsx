import Link from "~/components/link";

import TwoColumnsScroll from "~/components/sections/two-columns-scroll";

export default function JSONPlutusData() {
  return (
    <TwoColumnsScroll
      sidebarTo="JSONPlutusData"
      title="JSON Data Type"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        All Cardano data has the JSON representation, which is suitable for
        building Web3 app which needs frequent back and forth conversion between
        on-chain and off-chain code. Mesh also supports building data in JSON
        format with strong input validation support.
      </p>
      <Link href="/apis/data/json">
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
