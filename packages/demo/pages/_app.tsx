import '../styles/globals.css';
import '../styles/highlight/stackoverflow-dark.css';
import '../styles/custom.css';
import type { AppProps } from 'next/app';
import { WalletProvider } from '../contexts/wallet';
import Navbar from '../components/site/navbar';
import Footer from '../components/site/footer';

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <WalletProvider>
      <div className="cursor-default">
        <header>
          <Navbar />
        </header>
        <main className="pt-16 pb-16 lg:pb-24 bg-white dark:bg-gray-900">
          <Component {...pageProps} />
        </main>
        <Footer />
      </div>
    </WalletProvider>
  );
}

export default MyApp;
