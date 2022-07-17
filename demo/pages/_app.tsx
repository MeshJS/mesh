import "../styles/globals.css";
import type { AppProps } from "next/app";
import { Metatags, Navbar } from "../components";

function SafeHydrate({ children }) {
  return (
    <div suppressHydrationWarning>
      {typeof window === "undefined" ? null : children}
    </div>
  );
}

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <SafeHydrate>
      <Metatags />
      <Navbar />
      <div className="">
        <Component {...pageProps} />
      </div>
    </SafeHydrate>
  );
}

export default MyApp;
