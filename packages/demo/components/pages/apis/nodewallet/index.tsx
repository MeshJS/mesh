import ApisLayout from '../common/layout';
import LoadWallet from './loadWallet';

export default function NodeWallet() {
  const sidebarItems = [
    { label: 'Get installed wallets', to: 'getInstallWallets' },
  ];
  return (
    <ApisLayout sidebarItems={sidebarItems}>
      {/* <Hero /> */}
      <Main />
    </ApisLayout>
  );
}

function Main() {
  return (
    <>
      <LoadWallet />
      
    </>
  );
}
