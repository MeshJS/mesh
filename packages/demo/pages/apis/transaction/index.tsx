import { PaperAirplaneIcon } from '@heroicons/react/24/solid';
import type { NextPage } from 'next';
import CommonLayout from '../../../components/common/layout';
import SendAdaHandler from '../../../components/pages/apis/transaction/basic/sendAdaHandler';
import SendToken from '../../../components/pages/apis/transaction/basic/sendToken';
import TxSetMetadata from '../../../components/pages/apis/transaction/basic/setMetadata';
import CoinSelection from '../../../components/pages/apis/transaction/basic/coinSelection';
import CommonHero from '../../../components/pages/apis/transaction/commonHero';
import SendAda from '../../../components/pages/apis/transaction/basic/sendAda';
import SendAssets from '../../../components/pages/apis/transaction/basic/sendAssets';
import SetTimeLimit from '../../../components/pages/apis/transaction/basic/setTimeLimit';
import Metatags from '../../../components/site/metatags';
import SetCollateral from '../../../components/pages/apis/transaction/basic/setCollateral';
import SetRequiredSigners from '../../../components/pages/apis/transaction/basic/setRequiredSigners';
import SendValue from '../../../components/pages/apis/transaction/basic/sendValue';
import SetNativeScriptInput from '../../../components/pages/apis/transaction/basic/setNativeScriptInput';

const TransactionPage: NextPage = () => {
  const sidebarItems = [
    { label: 'Send ADA to addresses', to: 'sendAda' },
    { label: 'Send multi-assets', to: 'sendAssets' },
    { label: 'Send tokens', to: 'sendToken' },
    { label: 'Send assets to Handle', to: 'sendAdaHandler' },
    { label: 'Send value', to: 'sendValue' },
    { label: 'Coin selection', to: 'coinSelection' },
    { label: 'Set collateral', to: 'setCollateral' },
    { label: 'Set required signers', to: 'setRequiredSigners' },
    { label: 'Set time limit', to: 'setTimeLimit' },
    { label: 'Set metadata', to: 'setMetadata' },
    { label: 'Set Native Script', to: 'setNativeScriptInput' },
  ];

  let codeRecipient = ``;
  codeRecipient += `type Recipient =\n`;
  codeRecipient += `  | string\n`;
  codeRecipient += `  | {\n`;
  codeRecipient += `      address: string;\n`;
  codeRecipient += `      datum?: {\n`;
  codeRecipient += `        value: Data;\n`;
  codeRecipient += `        inline?: boolean;\n`;
  codeRecipient += `      };\n`;
  codeRecipient += `      script?: PlutusScript | NativeScript;\n`;
  codeRecipient += `    };\n`;

  return (
    <>
      <Metatags
        title="Transactions"
        description="Create transactions for sending assets."
      />
      <CommonLayout sidebarItems={sidebarItems}>
        <CommonHero
          title="Transactions"
          desc="Create transactions for sending assets."
          icon={<PaperAirplaneIcon className="w-16 h-16" />}
        ></CommonHero>
        <SendAda />
        <SendAssets />
        <SendToken />
        <SendAdaHandler />
        <SendValue />
        <CoinSelection />
        <SetCollateral />
        <SetRequiredSigners />
        <SetTimeLimit />
        <TxSetMetadata />
        <SetNativeScriptInput />
      </CommonLayout>
    </>
  );
};

export default TransactionPage;
