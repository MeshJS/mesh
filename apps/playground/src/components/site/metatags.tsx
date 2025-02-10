import Head from "next/head";

export default function Metatags({
  title,
  keywords,
  description,
  image,
}: {
  title?: string;
  keywords?: string;
  description?: string;
  image?: string;
}) {
  if (description === undefined) {
    description =
      "Intuitive and easy-to-use Web3 development framework to build amazing applications on Cardano.";
  }

  if (keywords === undefined) {
    keywords =
      "developer, tools, cardano, blockchain, sdk, plutus, crypto, web3, metaverse, gaming, ecommerce, nfts, apis, aiken";
  }

  if (title === undefined) {
    title = "Cardano Web3 TypeScript SDK & Off-Chain Framework";
  }

  return (
    <Head>
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta charSet="utf-8" />

      {title && <title>{`${title} - Mesh JS`}</title>}
      <meta name="description" content={description} />
      <meta name="keywords" content={keywords} />

      {title && <meta property="og:title" content={title} />}
      {title && <meta property="og:site_name" content={title} />}
      <meta property="og:type" content="website" />
      <meta property="og:description" content={description} />
      {image && (
        <meta property="og:image" content={`https://meshjs.dev${image}`} />
      )}
      {title && image === undefined && (
        <meta
          property="og:image"
          content={`https://meshjs.dev/api/og?title=${title}`}
        />
      )}
      {title && <meta property="og:image:alt" content={title} />}

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content="@meshsdk" />
      {title && <meta name="twitter:title" content={title} />}
      <meta name="twitter:description" content={description} />
      <meta name="twitter:creator" content="@meshsdk" />
      {image && (
        <meta property="twitter:image" content={`https://meshjs.dev${image}`} />
      )}
      {title && image === undefined && (
        <meta
          property="twitter:image"
          content={`https://meshjs.dev/api/og?title=${title}`}
        />
      )}
      {title && <meta name="twitter:image:alt" content={title} />}

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
}
