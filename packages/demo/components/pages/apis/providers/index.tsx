import CommonLayout from '../../../common/layout';
import Blockfrost from './blockfrost';
import Hero from './hero';
import Koios from './koios';

export default function Resolvers() {
  const sidebarItems = [
    { label: 'Blockfrost', to: 'Blockfrost' },
    { label: 'Koios', to: 'koios' },
    // { label: 'Infura', to: 'infura' },
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
      <Blockfrost />
      <Koios />
    </>
  );
}
