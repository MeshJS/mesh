import Codeblock from '../../../ui/codeblock';
import SectionTwoCol from '../common/sectionTwoCol';

export default function SignData() {
  return (
    <SectionTwoCol
      sidebarTo="signData"
      header="Sign Data"
      leftFn={Left()}
      rightFn={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        This endpoint utilizes the{' '}
        <a
          href="https://github.com/cardano-foundation/CIPs/tree/master/CIP-0030"
          target="_blank"
          rel="noreferrer"
        >
          CIP-8 - Message Signing
        </a>{' '}
        to sign arbitrary data, to verify the data was signed by the owner of
        the private key.
      </p>
      <p>A guide on how to use this is coming soon.</p>
      <Codeblock
        data={`const signature = await wallet.signData();`}
        isJson={false}
      />
    </>
  );
}

function Right() {
  return <></>;
}
