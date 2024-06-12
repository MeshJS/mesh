import CommonLayout from '../../../common/layout';
import SwapAcceptSwap from './acceptSwap';
import SwapCancelSwap from './cancelSwap';
import Hero from './hero';
import SwapInitiateSwap from './initiateSwap';

export default function ContractsSwap() {
  const sidebarItems = [
    { label: 'Initiate Swap', to: 'initiateSwap' },
    { label: 'Accept Swap', to: 'acceptSwap' },
    { label: 'Cancel Swap', to: 'cancelSwap' },
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
      <SwapInitiateSwap />
      <SwapAcceptSwap />
      <SwapCancelSwap />
    </>
  );
}
