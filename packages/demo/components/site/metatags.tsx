import Head from 'next/head';

const Metatags = ({ title, keywords, description, image }) => {
  return (
    <Head>
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta charSet="utf-8" />

      <title>
        {title
          ? title + ' - Mesh Playground by Martify Labs'
          : 'Mesh Playground by Martify Labs'}
      </title>

      <meta name="keywords" content={keywords} />
      <meta name="description" content={description} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content="@MartifyLabs" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      {image && (
        <meta
          name="twitter:image"
          content={`https://mesh.martify.io${image}`}
        />
      )}
      {image && <meta name="twitter:image:alt" content={title} />}

      <meta property="og:title" content={title} />
      <meta property="og:type" content="article" />
      <meta property="og:site_name" content="Mesh Playground by Martify Labs" />
      <meta property="og:description" content={description} />
      {image && (
        <meta property="og:image" content={`https://mesh.martify.io${image}`} />
      )}

      {/* favicon */}
      <link
        rel="apple-touch-icon"
        sizes="180x180"
        href="/favicon/apple-touch-icon.png"
      />
      <link
        rel="icon"
        type="image/png"
        sizes="32x32"
        href="/favicon/favicon-32x32.png"
      />
      <link
        rel="icon"
        type="image/png"
        sizes="16x16"
        href="/favicon/favicon-16x16.png"
      />
      <link rel="manifest" href="/favicon/site.webmanifest" />
      <link
        rel="mask-icon"
        href="/favicon/safari-pinned-tab.svg"
        color="#333333"
      />
      <meta name="msapplication-TileColor" content="#555555" />
      <meta name="theme-color" content="#eeeeee" />
    </Head>
  );
};

Metatags.defaultProps = {
  title: undefined,
  keywords:
    'developer, tools, cardano, blockchain, sdk, plutus, crypto, web3, metaverse, gaming, ecommerce, nfts, apis',
  description:
    'Intuitive and easy-to-use Web3 development framework to build amazing applications on Cardano.',
  image: '/logo-mesh/mesh.png',
};

export default Metatags;
