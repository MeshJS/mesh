import TwoColumnsScroll from "~/components/sections/two-columns-scroll";

export default function OtherUtils() {
  return (
    <TwoColumnsScroll
      sidebarTo="OtherUtils"
      title="Other Utilities"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        The code example showing above does not cover all utilities, please
        checkout the hosted documentation for more details. The not covered
        utilities are as below:
      </p>
      <ul>
        <li>
          <code>assetClass</code>
        </li>
        <li>
          <code>outputReference</code>
        </li>
        <li>
          <code>txOutRef</code>
        </li>
        <li>
          <code>dict</code>
        </li>
        <li>
          <code>tuple</code>
        </li>
        <li>
          <code>maybeStakingHash</code>
        </li>
        <li>
          <code>pubKeyAddress</code>
        </li>
        <li>
          <code>scriptAddress</code>
        </li>
      </ul>
    </>
  );
}

function Right() {
  return <></>;
}
