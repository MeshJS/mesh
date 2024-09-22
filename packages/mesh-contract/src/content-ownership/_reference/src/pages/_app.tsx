import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { MeshProvider } from "@meshsdk/react";
import { Provider } from "react-redux";
import store from "@/redux/store";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <MeshProvider>
      <Provider store={store}>
      <Component {...pageProps} />
      </Provider>
    </MeshProvider>
  );
}
