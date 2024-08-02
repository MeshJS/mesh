import "~/styles/globals.css";
import "~/styles/highlight/stackoverflow-dark.css";
import "@meshsdk/react/styles.css";

import type { AppProps } from "next/app";
import { GoogleTagManager } from "@next/third-parties/google";

import { MeshProvider } from "@meshsdk/react";

import Footer from "~/components/site/footer";
import Metatags from "~/components/site/metatags";
import Navbar from "~/components/site/navbar";
import Providers from "~/contexts/providers";

export default function App({ Component, pageProps }: AppProps) {
  <GoogleTagManager gtmId={process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS ?? ""} />;

  return (
    <MeshProvider>
      <Providers>
        <Metatags />
        <div className="cursor-default">
          <header>
            <Navbar />
          </header>
          <main className="bg-white pt-16 dark:bg-gray-900">
            <Component {...pageProps} />
          </main>
          <Footer />
          {/* <Scroller /> */}
        </div>
      </Providers>
    </MeshProvider>
  );
}
