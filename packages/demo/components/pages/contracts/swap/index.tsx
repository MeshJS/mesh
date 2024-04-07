import CommonLayout from '../../../common/layout';
import Hero from './hero';
// import VestingDepositFund from './depositFund';
// import VestingWithdrawFund from './withdrawFund';

export default function ContractsSwap() {
  const sidebarItems = [
    // { label: 'Deposit Fund', to: 'depositFund' },
    // { label: 'Withdraw Fund', to: 'withdrawFund' },
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
      {/* <VestingDepositFund />
      <VestingWithdrawFund /> */}
    </>
  );
}
