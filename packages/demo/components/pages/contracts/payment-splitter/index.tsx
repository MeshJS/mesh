import CommonLayout from '../../../common/layout';
import PaymentSplitterSendLovelace from './sendLovelace';
import Hero from './hero';
import PaymentSplitterTriggerPayout from './triggerPayout';

export default function ContractsPaymentSplitter() {
  const sidebarItems = [
    {
      label: 'Send Lovelace to Payment Splitter',
      to: 'sendLovelaceToSplitter',
    },
    { label: 'Trigger Payout', to: 'triggerPayout' },
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
      <PaymentSplitterSendLovelace />
      <PaymentSplitterTriggerPayout />
    </>
  );
}
