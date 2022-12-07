import type { NextPage } from 'next';
import Link from 'next/link';
import GuidesLayout from '../../components/pages/guides/layout';
import Codeblock from '../../components/ui/codeblock';
import { Element } from 'react-scroll';
import Metatags from '../../components/site/metatags';

const GuideMintingReferenceTokenPage: NextPage = () => {
  const sidebarItems = [
    { label: 'System setup', to: 'systemsetup' },
    { label: 'Project setup', to: 'projectsetup' },
    // { label: 'Build minting transaction', to: 'minttx' },
  ];

  const authors = [
    {
      url: 'https://twitter.com/jamesdunseith',
      image: 'https://pbs.twimg.com/profile_images/1582866510405636096/85X30CfV_400x400.jpg',
      name: 'James Dunseith',
      about: 'Co-founder Gimbalabs',
    },
  ];

  let codePackage = `{\n`;
  codePackage += `  ...\n`;
  codePackage += `  "type": "module",\n`;
  codePackage += `  "scripts": {\n`;
  codePackage += `    "start": "tsc && node ./dist/main.js"\n`;
  codePackage += `  }\n`;
  codePackage += `  ...\n`;
  codePackage += `}`;

  return (
    <>
      <Metatags
        title="Minting Reference Token"
        description="Something to describe this guide"
        image="/guides/minting-application.png"
      />
      <GuidesLayout
        title="Minting Reference Token"
        desc="Something to describe this guide"
        sidebarItems={sidebarItems}
        image="/guides/art-g68512aa8d_1280.jpg"
        authors={authors}
      >
        <p>write about the purpose of this guide and who is it for</p>
        <p>write some background here.</p>
        <Element name="systemsetup">
          <h2>First major component</h2>

          <h3>1. do this first</h3>
          <p>about this task</p>
          <Codeblock data={`// do something`} isJson={false} />

          <h3>2. then do this</h3>
          <p>some more things here</p>
          <Codeblock data={codePackage} isJson={false} />
        </Element>

        <Element name="projectsetup">
          <h2>another main component</h2>
          <p>Firstly, you need to bla bla bla</p>
          <Codeblock data={`// do something`} isJson={false} />
        </Element>
      </GuidesLayout>
    </>
  );
};

export default GuideMintingReferenceTokenPage;
