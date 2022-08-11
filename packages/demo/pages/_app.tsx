import '../styles/globals.css';
import "../styles/demopages.css";

import type { AppProps } from 'next/app';
import { Metatags, Navbar } from '../components';
import { WalletProvider } from '../contexts/wallet';

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <WalletProvider>
      <Metatags />
      <Navbar />
      {/* <div className="prose dark:prose-invert max-w-full"> */}
      <div className="format lg:format-lg dark:format-invert max-w-full">
        <div className="mx-auto max-w-screen-xl">
          <Component {...pageProps} />
        </div>
      </div>
    </WalletProvider>
  );
}

export default MyApp;
