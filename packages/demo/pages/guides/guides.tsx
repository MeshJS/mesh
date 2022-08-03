import { Card, Codeblock, Metatags } from '../../components';
import Link from 'next/link';

const GUIDES = [
  {
    title: 'Start a Web3 app on Next.js',
    desc: "A step-by-step guide to setup a Next.js web application, connect wallet and browse wallet's assets.",
    link: '/guides/nextjs',
  },
  {
    title: 'Start a Node.js project with Mesh',
    desc: 'Coming soon...',
    link: '/guides/nodejs',
  },
  {
    title: 'Lock and redeem assets with Smart Contracts',
    desc: 'Coming soon...',
    link: '/guides/coming-soon',
  },
  {
    title: 'Multi-signatures assets minting',
    desc: 'Coming soon...',
    link: '/guides/coming-soon',
  },
  {
    title: 'Multi-signatures transactions',
    desc: 'Coming soon...',
    link: '/guides/coming-soon',
  },
];

const Guides = () => {
  return (
    <div className="px-4">
      <Metatags
        title="Guides for Getting Started"
        description="Build an application to display assets or a complex dApp to interact with Cardano blockchain and smart contracts; this section will help you get started."
      />
      <Intro />
      <Listings />
    </div>
  );
};

function Intro() {
  return (
    <section>
      <div className="py-8 lg:py-16 lg:px-6">
        <h1>Guides for Getting Started</h1>
        <p className="lead">
          Mesh is a JavaScript library for building Web3 applications on
          Cardano.
        </p>
        <p>
          Mesh has been designed from the start for gradual adoption, and you
          can use as little or as much as you need. Whether you want to build an
          application to connect wallet and display what&apos;s in your wallet
          or start a complex dApp to create transactions and interact with
          Cardano blockchain and smart contracts; this section will help you get
          started.
        </p>
      </div>
    </section>
  );
}

function Listings() {
  return (
    <div className="grid gap-8 lg:grid-cols-3">
      {GUIDES.map((guide, i) => {
        return (
          <Link href={guide.link} key={i}>
            <div className="cursor-pointer">
              <Card className="h-64">
                <h2 className="mt-4">{guide.title}</h2>
                <p>{guide.desc}</p>
              </Card>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function StartNextJsWebApp() {
  return <></>;
}

function SeekHelp() {
  return (
    <section>
      <div className="py-8 px-4 lg:py-16 lg:px-6">
        <h1>Help, I&apos;m Stuck!</h1>
        <p>
          If you get stuck, check out{' '}
          <a
            href="https://cardano.stackexchange.com/"
            target="_blank"
            rel="noreferrer"
          >
            cardano.stackexchange.com
          </a>
          . You can ask questions and tagged it with <b>mesh</b>.
        </p>
        <p>
          If you don&apos;t receive an answer, or if you remain stuck, please
          file{' '}
          <a
            href="https://github.com/MartifyLabs/mesh/issues"
            target="_blank"
            rel="noreferrer"
          >
            an issue
          </a>
          , and we will help you out.
        </p>
        <p>
          You can also ask questions on{' '}
          <a
            href="https://discord.gg/Z6AH9dahdH"
            target="_blank"
            rel="noreferrer"
          >
            Martify&apos;s
          </a>
          ,{' '}
          <a
            href="https://discord.gg/Va7DXqSSn8"
            target="_blank"
            rel="noreferrer"
          >
            Gimbalabs&apos;
          </a>{' '}
          or{' '}
          <a
            href="https://discord.gg/inputoutput"
            target="_blank"
            rel="noreferrer"
          >
            IOG Technical Community&apos;s
          </a>{' '}
          Discord servers.
        </p>
      </div>
    </section>
  );
}

export default Guides;
