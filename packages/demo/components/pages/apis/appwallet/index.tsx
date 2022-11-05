import CommonLayout from '../../../common/layout';
import GenerateWallet from './generateWallet';
import Hero from './hero';
import LoadWallet from './loadWallet';
import SignData from './signData';
import SignTx from './signTx';

export default function AppWallet() {
  const sidebarItems = [
    { label: 'Generate wallet', to: 'generateWallet' },
    { label: 'Load wallet', to: 'loadWallet' },
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
      <SignTx />
      <SignData />
    </>
  );
}
