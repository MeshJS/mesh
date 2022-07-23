import "../styles/globals.css";
import type { AppProps } from "next/app";
import { Metatags, Navbar } from "../components";

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <Metatags />
      <Navbar />
      <div className="prose dark:prose-invert max-w-full">
        <div className="mx-auto max-w-screen-xl">
          <Component {...pageProps} />
        </div>
      </div>
    </>
  );
}

export default MyApp;
