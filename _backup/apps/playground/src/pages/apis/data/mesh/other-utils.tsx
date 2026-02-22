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
          <code>mAssetClass</code>
        </li>
        <li>
          <code>mOutputReference</code>
        </li>
        <li>
          <code>mTxOutRef</code>
        </li>
        <li>
          <code>mTuple</code>
        </li>
        <li>
          <code>mMaybeStakingHash</code>
        </li>
        <li>
          <code>mPubKeyAddress</code>
        </li>
        <li>
          <code>mScriptAddress</code>
        </li>
      </ul>
    </>
  );
}

function Right() {
  return <></>;
}
