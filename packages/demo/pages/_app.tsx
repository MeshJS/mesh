import '../styles/globals.css';
import '../styles/custom.css';
import type { AppProps } from 'next/app';
import { WalletProvider } from '../contexts/wallet';
import Navbar from '../components/site/Navbar';

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <WalletProvider>
      <header>
        <Navbar />
      </header>
      <main className="pt-16 pb-16 lg:pb-24 bg-white dark:bg-gray-900 cursor-default">
        <Component {...pageProps} />
      </main>
    </WalletProvider>
  );
}

export default MyApp;
