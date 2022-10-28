import Codeblock from '../../../ui/codeblock';
import SectionTwoCol from '../../../common/sectionTwoCol';

export default function StarterNextjs() {
  return (
    <>
      <SectionTwoCol
        sidebarTo="nextjs"
        header="Next.js Starter"
        leftFn={Left()}
        rightFn={Right()}
      />
    </>
  );
}

function Left() {
  let code1 = `npx thirdweb create -template nextjs`;

  return (
    <>
      <p>
        Start a new project on Next.js. This starter template consist of{' '}
        <code>MeshProvider</code> and <code>ConnectWallet</code> UI component.
      </p>
      <Codeblock data={code1} isJson={false} />
    </>
  );
}

function Right() {
  return <></>;
}
