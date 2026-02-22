import TwoColumnsScroll from "~/components/sections/two-columns-scroll";

export default function CBORPlutusData() {
  return (
    <TwoColumnsScroll
      sidebarTo="CBORPlutusData"
      title="CBOR"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        CBOR is the lowest level representation of data in Cardano. Mesh
        provides endpoints to allow users to provide CBOR in providing data,
        which is the case for developers utilizing other serialization package
        other than mesh in part the application.
      </p>
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
