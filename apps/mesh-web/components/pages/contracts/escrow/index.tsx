import CommonLayout from '../../../common/layout';
import EscrowCancel from './cancelEscrow';
import EscrowComplete from './completeEscrow';
import Hero from './hero';
import EscrowInitiate from './initiateEscrow';
import EscrowDeposit from './recipientDeposit';

export default function ContractsEscrow() {
  const sidebarItems = [
    { label: 'Escrow Initiate', to: 'initiateEscrow' },
    { label: 'Recipient Deposit', to: 'recipientDeposit' },
    { label: 'Complete Escrow', to: 'completeEscrow' },
    { label: 'Cancel Escrow', to: 'cancelEscrow' },
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
      <EscrowInitiate />
      <EscrowDeposit />
      <EscrowComplete />
      <EscrowCancel />
    </>
  );
}
