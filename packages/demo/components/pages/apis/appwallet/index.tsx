import CommonLayout from '../../../common/layout';
import GenerateWallet from './generateWallet';
import GetPaymentAddress from './getPaymentAddress';
import GetRewardAddress from './getRewardAddress';
import Hero from './hero';
import LoadWallet from './loadWallet';
import SignData from './signData';
import SignTx from './signTx';

export default function AppWallet() {
  const sidebarItems = [
    { label: 'Generate wallet', to: 'generateWallet' },
    { label: 'Load wallet', to: 'loadWallet' },
    { label: 'Get payment address', to: 'getPaymentAddress' },
    { label: 'Get reward address', to: 'getRewardAddress' },
    { label: 'Sign transactions', to: 'signTx' },
    { label: 'Sign data', to: 'signData' },
  ];

  return (
    <CommonLayout sidebarItems={sidebarItems}>
      <Hero />
      <Main />
    </CommonLayout>
  );
}

function Main() {
  return (
    <>
      <GenerateWallet />
      <LoadWallet />
      <GetPaymentAddress />
      <GetRewardAddress />
      <SignTx />
      <SignData />
    </>
  );
}
