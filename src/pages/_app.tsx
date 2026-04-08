import type { AppProps } from "next/app";
import { Fraunces, IBM_Plex_Mono } from "next/font/google";

import "@/styles/globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export default function App({ Component, pageProps }: AppProps) {
  return (
    <div className={`${fraunces.variable} ${plexMono.variable} min-h-screen`}>
      <Component {...pageProps} />
    </div>
  );
}
