import type { NextPage } from "next";

import HeaderAndCards from "~/components/layouts/header-and-cards";
import HeroTwoSections from "~/components/sections/hero-two-sections";
import Metatags from "~/components/site/metatags";
import SvgSurprise from "~/components/svgs/surpriseSvg";
import { metaSupportUs } from "~/data/links-about";
import { linkDiscord, linkGithub, linkTwitter } from "~/data/social";
import SendPayment from "./donate-section";

const ReactPage: NextPage = () => {
  let codeBadge = ``;
  codeBadge += `import { MeshBadge } from '@meshsdk/react';\n`;
  codeBadge += `\n`;
  codeBadge += `export default function Page() {\n`;
  codeBadge += `  return (\n`;
  codeBadge += `    <>\n`;
  codeBadge += `      <MeshBadge />\n`;
  codeBadge += `    </>\n`;
  codeBadge += `  );\n`;
  codeBadge += `}\n`;

  return (
    <>
      <Metatags title={metaSupportUs.title} description={metaSupportUs.desc} />
      <HeaderAndCards
        headerTitle={metaSupportUs.title}
        headerParagraph={metaSupportUs.desc}
      />
      <HeroTwoSections
        title="Follow us on Twitter"
        description="Follow us on Twitter so you get get updated with the latest development!"
        image="/support/twitter.png"
        link={{ label: "Follow us on Twitter", href: linkTwitter.redirect }}
      />

      <HeroTwoSections
        title="Donate to Mesh"
        description="Your support for this open-source SDK will go a long way. So thank you!"
        image={
          <SvgSurprise className={`w-50 h-50 fill-black dark:fill-white`} />
        }
        children={<SendPayment />}
      />

      <HeroTwoSections
        title="Star Mesh GitHub Repo"
        description="Visit our GitHub and star it!"
        image={
          <>
            <img
              className="hidden w-full sm:block dark:hidden"
              src="/support/github-light.png"
              alt="support"
            />
            <img
              className="hidden w-full dark:sm:block"
              src="/support/github-dark.png"
              alt="support"
            />
          </>
        }
        link={{ label: "Star GitHub repo", href: linkGithub.redirect }}
      />

      <HeroTwoSections
        title="Add Mesh Badge in your Application"
        description="Add our beautiful Mesh Badge to give your users confidence knowing that your application is running on top of a solid SDK."
        image="/support/meshbadge.png"
        code={codeBadge}
      />

      <HeroTwoSections
        title="Join our Discord Server"
        description="Come and talk to us in our Discord server."
        image="/support/discord.png"
        link={{
          label: "Join Mesh's Discord server",
          href: linkDiscord.redirect,
        }}
      />
    </>
  );
};

export default ReactPage;
