import "../styles/globals.css";
import type { AppProps } from "next/app";
import { Navbar } from "../components";

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <Navbar />
      <div className="">
        <Component {...pageProps} />
      </div>
    </>
  );
}

export default MyApp;
