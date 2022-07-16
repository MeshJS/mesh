import "../styles/globals.css";
import type { AppProps } from "next/app";
import { Metatags, Navbar } from "../components";

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <Metatags />
      <Navbar />
      <div className="">
        <Component {...pageProps} />
      </div>
    </>
  );
}

export default MyApp;
