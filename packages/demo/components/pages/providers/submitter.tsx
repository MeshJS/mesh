import Codeblock from '../../ui/codeblock';
import SectionTwoCol from '../../common/sectionTwoCol';
import { BadgeSubmitter } from './badges';

export default function Submitter({ submitter, submitterName }) {
  return (
    <>
      <SectionTwoCol
        sidebarTo="submitTx"
        header="submitTx"
        leftFn={submitTxLeft({
          submitterName,
        })}
        rightFn={<></>}
        isH3={true}
        badge={<BadgeSubmitter />}
      />
    </>
  );
}

function submitTxLeft({ submitterName }) {
  let code1 = `await ${submitterName}.submitTx(signedTx)`;
  return (
    <>
      <p>Submit a serialized transaction to the network.</p>
      <Codeblock data={code1} isJson={false} />
    </>
  );
}
