import type { NextPage } from 'next';
import Metatags from '../../components/site/metatags';

const ReferencesPage: NextPage = () => {
  return (
    <>
      <Metatags title="References" />
      <section className="bg-white dark:bg-gray-900">
        <div className="py-8 px-4 mx-auto max-w-screen-xl lg:py-16 lg:px-6">
          <div className="px-4 mx-auto mb-8 text-center md:mb-16 lg:px-0">
            <h2 className="mb-4 text-3xl tracking-tight font-extrabold text-gray-900 md:text-4xl dark:text-white">
              Interviews
            </h2>
            <p className="font-light text-gray-500 sm:text-xl dark:text-gray-400 mb-4"></p>
            <div className="grid grid-cols-3 gap-2">
              <ListofReferences />
            </div>
          </div>
          <div className="px-4 mx-auto mb-8 text-center md:mb-16 lg:px-0">
            <h2 className="mb-4 text-3xl tracking-tight font-extrabold text-gray-900 md:text-4xl dark:text-white">
              Tweets
            </h2>
            <p className="font-light text-gray-500 sm:text-xl dark:text-gray-400 mb-4"></p>
            <div className="grid grid-cols-4 gap-2">
              <ListofTestimonials />
            </div>
          </div>
        </div>
      </section>
    </>
  );
};

export default ReferencesPage;

function ListofReferences() {
  return (
    <>
      <CardLink
        title="Mesh Interview"
        desc="Cardano Foundation - Mar 2023"
        url="https://developers.cardano.org/blog/2023-03-21-march"
      />

      <CardLink
        title="Multi-sig Minting Tutorial"
        desc="EMURGO Academy - Feb 2023"
        url="https://www.youtube.com/watch?v=JtpPxv7lL8s"
      />
      <CardLink
        title="Mesh Intro and Q&A"
        desc="Catalyst Townhall - Dec 2022"
        url="https://www.youtube.com/watch?v=YOBo39ZB_1Y"
      />
      <CardLink
        title="Mesh Playground and Q&A"
        desc="Catalyst Townhall - Dec 2023"
        url="https://www.youtube.com/watch?v=BTYGcgK_2bc"
      />
      <CardLink
        title="Mesh: The Innovative Toolkit Empowering Building on Cardano"
        desc="AdaPulse - Dec 2022"
        url="https://adapulse.io/introducing-mesh-the-innovative-toolkit-empowering-building-on-cardano/"
      />
      <CardLink
        title="The Revolutionary Mesh Developer Toolkit"
        desc="This Week In Cardano - Jan 2023"
        url="https://www.youtube.com/watch?v=1A_uBrqZx3Y"
      />
      <CardLink
        title="Building on Cardano: Book.io and Mesh"
        desc="Cardano360 - Dec 2022"
        url="https://www.youtube.com/watch?v=SnTYKHDZ8rY"
      />
    </>
  );
}

function CardLink({ title, desc, url }) {
  return (
    <a
      href={url}
      className="block max-w-sm p-6 bg-white border border-gray-200 rounded-lg shadow hover:bg-gray-100 dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700"
      target="_blank"
      rel="noreferrer"
    >
      <h5 className="mb-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
        {title}
      </h5>
      <p className="font-normal text-gray-700 dark:text-gray-400">{desc}</p>
    </a>
  );
}

function ListofTestimonials() {
  return (
    <>
      <blockquote className="twitter-tweet">
        <p lang="en" dir="ltr">
          It&#39;s incredible that you can start building on{' '}
          <a
            target="_blank"
            rel="noreferrer"
            href="https://twitter.com/hashtag/Cardano?src=hash&amp;ref_src=twsrc%5Etfw"
          >
            #Cardano
          </a>{' '}
          so easily with{' '}
          <a
            target="_blank"
            rel="noreferrer"
            href="https://twitter.com/meshsdk?ref_src=twsrc%5Etfw"
          >
            @meshsdk
          </a>
          . Same old React stuff with NextJS. Host on{' '}
          <a
            target="_blank"
            rel="noreferrer"
            href="https://twitter.com/vercel?ref_src=twsrc%5Etfw"
          >
            @vercel
          </a>{' '}
          in 5 mins. Download{' '}
          <a
            target="_blank"
            rel="noreferrer"
            href="https://twitter.com/FlintWallet?ref_src=twsrc%5Etfw"
          >
            @FlintWallet
          </a>{' '}
          and access through dApp browser. Boom, you&#39;re live. And
          multi-platform. And iterating. 100x speed.{' '}
          <a
            target="_blank"
            rel="noreferrer"
            href="https://twitter.com/MochaApp?ref_src=twsrc%5Etfw"
          >
            @MochaApp
          </a>{' '}
          WIP.{' '}
          <a target="_blank" rel="noreferrer" href="https://t.co/k7NKUWf2ts">
            pic.twitter.com/k7NKUWf2ts
          </a>
        </p>
        &mdash; Jeremy Soo (@Jeremysoojk){' '}
        <a
          target="_blank"
          rel="noreferrer"
          href="https://twitter.com/Jeremysoojk/status/1626857977675411458?ref_src=twsrc%5Etfw"
        >
          February 18, 2023
        </a>
      </blockquote>
      <blockquote className="twitter-tweet">
        <p lang="en" dir="ltr">
          Want to dip your toes in Cardano Development?
          <br />
          <br />
          Building a site and sending transactions is made easy with{' '}
          <a
            target="_blank"
            rel="noreferrer"
            href="https://twitter.com/meshsdk?ref_src=twsrc%5Etfw"
          >
            @meshsdk
          </a>{' '}
          check out my idiot-proof guide
          <a target="_blank" rel="noreferrer" href="https://t.co/TWnHldEhDn">
            https://t.co/TWnHldEhDn
          </a>
        </p>
        &mdash; BlockSplained (@blocksplained){' '}
        <a
          target="_blank"
          rel="noreferrer"
          href="https://twitter.com/blocksplained/status/1625831013724168192?ref_src=twsrc%5Etfw"
        >
          February 15, 2023
        </a>
      </blockquote>
      <blockquote className="twitter-tweet" data-conversation="none">
        <p lang="en" dir="ltr">
          A LOT is coming from{' '}
          <a
            target="_blank"
            rel="noreferrer"
            href="https://twitter.com/meshsdk?ref_src=twsrc%5Etfw"
          >
            @meshsdk
          </a>{' '}
          and{' '}
          <a
            target="_blank"
            rel="noreferrer"
            href="https://twitter.com/jinglescode?ref_src=twsrc%5Etfw"
          >
            @jinglescode
          </a>{' '}
          - they keep adding new functionality every day. Today&#39;s function
          eliminates irrelevant UTxOs and it makes devs jobs to write off-chain
          code much easier 💪
          <a target="_blank" rel="noreferrer" href="https://t.co/qZiRqepAjw">
            https://t.co/qZiRqepAjw
          </a>
        </p>
        &mdash; Mladen Lm | Cardano Rumors Guy (@MladenLm){' '}
        <a
          target="_blank"
          rel="noreferrer"
          href="https://twitter.com/MladenLm/status/1625986026463236096?ref_src=twsrc%5Etfw"
        >
          February 15, 2023
        </a>
      </blockquote>
      <blockquote className="twitter-tweet">
        <p lang="en" dir="ltr">
          Building your first site that connects a wallet and sends a
          transaction using Mesh SDK | Developer Diary #4
          <br />
          <br />
          Article by{' '}
          <a
            target="_blank"
            rel="noreferrer"
            href="https://twitter.com/blocksplained?ref_src=twsrc%5Etfw"
          >
            @blocksplained
          </a>{' '}
          <a
            target="_blank"
            rel="noreferrer"
            href="https://twitter.com/hashtag/Cardano?src=hash&amp;ref_src=twsrc%5Etfw"
          >
            #Cardano
          </a>{' '}
          <a
            target="_blank"
            rel="noreferrer"
            href="https://twitter.com/search?q=%24ADA&amp;src=ctag&amp;ref_src=twsrc%5Etfw"
          >
            $ADA
          </a>
          <a target="_blank" rel="noreferrer" href="https://t.co/7WErQ046Rd">
            https://t.co/7WErQ046Rd
          </a>
        </p>
        &mdash; Ada Pulse (@Adapulse_io){' '}
        <a
          target="_blank"
          rel="noreferrer"
          href="https://twitter.com/Adapulse_io/status/1625489873879826432?ref_src=twsrc%5Etfw"
        >
          February 14, 2023
        </a>
      </blockquote>
      <blockquote className="twitter-tweet" data-conversation="none">
        <p lang="en" dir="ltr">
          thanks for all your hard work and documentation which got me started
          and going within 2 hours :)
        </p>
        &mdash; jack friks (@jackfriks){' '}
        <a
          target="_blank"
          rel="noreferrer"
          href="https://twitter.com/jackfriks/status/1623356244969902085?ref_src=twsrc%5Etfw"
        >
          February 8, 2023
        </a>
      </blockquote>
      <blockquote className="twitter-tweet" data-conversation="none">
        <p lang="en" dir="ltr">
          it’s actually so simple with{' '}
          <a
            target="_blank"
            rel="noreferrer"
            href="https://twitter.com/meshsdk?ref_src=twsrc%5Etfw"
          >
            @meshsdk
          </a>{' '}
          too it’s wild.
          <br />
          <br />
          on top of that would you want to learn how to do things like buy a
          domain and host your site or should i leave that out? and keep it just
          based on the cardano functionality after initial setup of a local
          server?
        </p>
        &mdash; jack friks (@jackfriks){' '}
        <a
          target="_blank"
          rel="noreferrer"
          href="https://twitter.com/jackfriks/status/1623351158809976832?ref_src=twsrc%5Etfw"
        >
          February 8, 2023
        </a>
      </blockquote>
      <blockquote className="twitter-tweet" data-conversation="none">
        <p lang="en" dir="ltr">
          3.{' '}
          <a
            target="_blank"
            rel="noreferrer"
            href="https://twitter.com/meshsdk?ref_src=twsrc%5Etfw"
          >
            @meshsdk
          </a>
          , the EASIEST way to start building on{' '}
          <a
            target="_blank"
            rel="noreferrer"
            href="https://twitter.com/hashtag/Cardano?src=hash&amp;ref_src=twsrc%5Etfw"
          >
            #Cardano
          </a>
          , released its latest update.
          <br />
          <br />I first met Mesh Co-founder{' '}
          <a
            target="_blank"
            rel="noreferrer"
            href="https://twitter.com/jinglescode?ref_src=twsrc%5Etfw"
          >
            @jinglescode
          </a>{' '}
          at{' '}
          <a
            target="_blank"
            rel="noreferrer"
            href="https://twitter.com/hashtag/CardanoSummit2022?src=hash&amp;ref_src=twsrc%5Etfw"
          >
            #CardanoSummit2022
          </a>{' '}
          SG event and was blown away. You&#39;ve got to check out{' '}
          <a target="_blank" rel="noreferrer" href="https://t.co/Tj7bnVSUyg">
            https://t.co/Tj7bnVSUyg
          </a>
          .<br />
          <br />
          🚨 Builders take note!{' '}
          <a target="_blank" rel="noreferrer" href="https://t.co/FOu7vDDnnu">
            https://t.co/FOu7vDDnnu
          </a>
        </p>
        &mdash; Jeremy Soo (@Jeremysoojk){' '}
        <a
          target="_blank"
          rel="noreferrer"
          href="https://twitter.com/Jeremysoojk/status/1620068978432561155?ref_src=twsrc%5Etfw"
        >
          January 30, 2023
        </a>
      </blockquote>
      <blockquote className="twitter-tweet" data-conversation="none">
        <p lang="en" dir="ltr">
          Congrats on the milestone! It&#39;s has been an absolute joy to use
          over the last few weeks, very excited about rolling out our new
          Mesh-based multisig minting system for{' '}
          <a
            target="_blank"
            rel="noreferrer"
            href="https://twitter.com/ChainChillaz?ref_src=twsrc%5Etfw"
          >
            @ChainChillaz
          </a>{' '}
          next month.
        </p>
        &mdash; haz (@HazRyder){' '}
        <a
          target="_blank"
          rel="noreferrer"
          href="https://twitter.com/HazRyder/status/1617241575171710976?ref_src=twsrc%5Etfw"
        >
          January 22, 2023
        </a>
      </blockquote>
      <blockquote className="twitter-tweet" data-conversation="none">
        <p lang="en" dir="ltr">
          20/
          <a
            target="_blank"
            rel="noreferrer"
            href="https://twitter.com/meshsdk?ref_src=twsrc%5Etfw"
          >
            @meshsdk
          </a>{' '}
          is a one stop shop for building web3 apps on Cardano and can be found
          at{' '}
          <a target="_blank" rel="noreferrer" href="https://t.co/8IGL8h9U6J">
            https://t.co/8IGL8h9U6J
          </a>
          <br />
          <br />
          They released v1.3.0. This week{' '}
          <a
            target="_blank"
            rel="noreferrer"
            href="https://twitter.com/jinglescode?ref_src=twsrc%5Etfw"
          >
            @jinglescode
          </a>{' '}
          also showed us “Mesh AI”: leverage ChatGPT to help you build Cardano
          apps{' '}
          <a target="_blank" rel="noreferrer" href="https://t.co/AADMZULPpR">
            https://t.co/AADMZULPpR
          </a>
        </p>
        &mdash; ADA whale (@cardano_whale){' '}
        <a
          target="_blank"
          rel="noreferrer"
          href="https://twitter.com/cardano_whale/status/1611573829905846273?ref_src=twsrc%5Etfw"
        >
          January 7, 2023
        </a>
      </blockquote>
    </>
  );
}
