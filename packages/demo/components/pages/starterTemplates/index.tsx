import CommonLayout from '../../common/layout';
import CommonSection from './commonSection';
import Hero from './hero';

const items = [
  {
    label: 'Next.js Typescript',
    to: 'nextjs',
    installCode: 'npx mesh create --template nextjs-typescript',
    demoUrl: 'http://github.com',
    repoUrl: 'http://github.com',
    desc: (
      <p>
        Start a new project on Next.js. This starter template consist of{' '}
        <code>MeshProvider</code> and <code>CardanoWallet</code> UI component.
      </p>
    ),
  },
];

export default function ReactStarterTemplates() {
  return (
    <CommonLayout sidebarItems={items}>
      <Hero />
      <Main />
    </CommonLayout>
  );
}

function Main() {
  return (
    <>
      {items.map((item, i) => {
        return (
          <CommonSection
            key={i}
            title={item.label}
            desc={item.desc}
            sidebarTo={item.to}
            installCode={item.installCode}
            demoUrl={item.demoUrl}
            repoUrl={item.repoUrl}
          ></CommonSection>
        );
      })}
    </>
  );
}
