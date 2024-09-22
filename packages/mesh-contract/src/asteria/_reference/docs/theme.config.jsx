export default {
  logo: <h1 className="font-bold text-4xl md:text-4xl lg:text-5xl">Asteria</h1>,
  project: {
    link: "https://github.com/txpipe/asteria",
  },
  chat: {
    link: "https://discord.gg/Vc3x8N9nz2",
  },
  footer: {
    text: "Asteria - TxPipe",
  },
  nextThemes: {
    defaultTheme: "dark",
  },
  docsRepositoryBase: "https://github.com/txpipe/asteria/tree/main/docs",
  useNextSeoProps() {
    return {
      titleTemplate: "%s – Asteria",
      description: "A Cardano bot challenge to showcase the capabilities of the eUTxO model",
      canonical: "https://asteria.txpipe.io",
      siteName: "Asteria",
      openGraph: {
        url: "https://asteria.txpipe.io",
        title: "Asteria",
        description: "A Cardano bot challenge to showcase the capabilities of the eUTxO model",
        images: [
          {
            url: "https://asteria.txpipe.io/logo-full.png",
            width: 496,
            height: 496,
            alt: "Asteria",
            type: "image/png",
          },
        ],
      },
    };
  },
};
