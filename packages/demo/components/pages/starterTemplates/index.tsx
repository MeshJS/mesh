import CommonLayout from '../../common/layout';
import Hero from './hero';
import StarterNextjs from './nextjs';

export default function ReactStarterTemplates() {
  const sidebarItems = [
    { label: 'Next.js', to: 'nextjs' },
    { label: 'Multisig minting', to: 'multisigMinting' },
  ];
  return (
    <CommonLayout sidebarItems={sidebarItems}>
      <Hero />
      <Main />
    </CommonLayout>
  );
}
// todo, need to remove starters from react, because we can have nodejs starters too
function Main() {
  return (
    <>
      <StarterNextjs />
    </>
  );
}
