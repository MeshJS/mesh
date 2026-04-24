import { useState } from "react";

import HeaderAndCards from "~/components/layouts/header-and-cards";
import Link from "~/components/link";
import Metatags from "~/components/site/metatags";
import Header3 from "~/components/text/header3";
import Paragraph2 from "~/components/text/paragraph2";
import { metaBranding } from "~/data/links-about";

export default function Media() {
  return (
    <>
      <Metatags title={metaBranding.title} description={metaBranding.desc} />
      <HeaderAndCards
        headerTitle={metaBranding.title}
        headerParagraph={metaBranding.desc}
      />
      <div className="mx-auto max-w-screen-lg space-y-8 px-4 py-8 lg:px-6 lg:py-16">
        <Logo />
        {/* <Wordmark /> */}
      </div>
    </>
  );
}

function Logo() {
  const [selectedLogo, setSelectedLogo] = useState<"black" | "white">("black");

  return (
    <div>
      <Header3>Logo</Header3>
      <Paragraph2>
        The Mesh logo is available in two color schemes: black and white. You
        can use the logo in either color scheme depending on your design needs.
        The logo is available in various sizes to suit different use cases.
      </Paragraph2>

      <div className="flex flex-col gap-2 text-black dark:text-white">
        <div className="mt-4 flex space-x-4">
          <button
            className={`flex h-12 w-12 items-center justify-center rounded-full bg-white text-black ${
              selectedLogo === "black" ? "shadow-xl" : ""
            }`}
            aria-label="Black Button"
            onClick={() => setSelectedLogo("black")}
          >
            <img
              src="/logo-mesh/black/logo-mesh-black-64x64.png"
              className="h-8 w-8 rounded-full"
            />
          </button>
          <button
            className={`flex h-12 w-12 items-center justify-center rounded-full border border-neutral-300 bg-black text-white ${
              selectedLogo === "white" ? "shadow-xl" : ""
            }`}
            aria-label="White Button"
            onClick={() => setSelectedLogo("white")}
          >
            <img
              src="/logo-mesh/white/logo-mesh-white-64x64.png"
              className="h-8 w-8 rounded-full"
            />
          </button>
        </div>

        <Image
          img={
            selectedLogo === "black"
              ? "/logo-mesh/black/logo-mesh-black-512x512.png"
              : "/logo-mesh/white/logo-mesh-white-512x512.png"
          }
          bg={selectedLogo === "black" ? "bg-white" : "bg-black"}
        />

        <div className="mt-4 flex items-center gap-2">
          <div className="font-serif">Download black logo:</div>
          <div className="flex gap-2">
            <Link
              href={`/logo-mesh/black/logo-mesh-vector.svg`}
              target="_blank"
              className="text-blue-500 hover:underline"
            >
              SVG
            </Link>
            {["16x16", "32x32", "64x64", "128x128", "256x256", "512x512"].map(
              (size) => (
                <Link
                  key={size}
                  href={`/logo-mesh/black/logo-mesh-black-${size}.png`}
                  target="_blank"
                  className="text-blue-500 hover:underline"
                >
                  {`${size}`}
                </Link>
              ),
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="font-serif">Download white logo:</div>
          <div className="flex gap-2">
            <Link
              href={`/logo-mesh/white/logo-mesh-vector.svg`}
              target="_blank"
              className="text-blue-500 hover:underline"
            >
              SVG
            </Link>
            {["16x16", "32x32", "64x64", "128x128", "256x256", "512x512"].map(
              (size) => (
                <Link
                  key={size}
                  href={`/logo-mesh/white/logo-mesh-white-${size}.png`}
                  target="_blank"
                  className="text-blue-500 hover:underline"
                >
                  {`${size}`}
                </Link>
              ),
            )}
          </div>
        </div>

        <Image
          img={
            selectedLogo === "black"
              ? "/logo-mesh/meshlogo-with-title-black.svg"
              : "/logo-mesh/meshlogo-with-title-white.svg"
          }
          bg={selectedLogo === "black" ? "bg-white" : "bg-black"}
        />

        <div className="mt-4 flex items-center gap-2">
          <div className="font-serif">Download black logo with title:</div>
          <div className="flex gap-2">
            <Link
              href={`/logo-mesh/meshlogo-with-title-black.svg`}
              target="_blank"
              className="text-blue-500 hover:underline"
            >
              SVG
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="font-serif">Download white logo with title:</div>
          <div className="flex gap-2">
            <Link
              href={`/logo-mesh/meshlogo-with-title-white.svg`}
              target="_blank"
              className="text-blue-500 hover:underline"
            >
              SVG
            </Link>
          </div>
        </div>

        <Image img="/logo-mesh/mesh.png" />

        <div className="mt-4 flex items-center gap-2">
          <div className="font-serif">Download logo with background:</div>
          <div className="flex gap-2">
            <Link
              href={`/logo-mesh/mesh.png`}
              target="_blank"
              className="text-blue-500 hover:underline"
            >
              PNG
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// function Wordmark() {
//   return (
//     <div>
//       <Header3>Wordmark</Header3>
//       <Paragraph2>
//         The Mesh wordmark is available in two color schemes: black and white.
//         You can use the wordmark in either color scheme depending on your design
//         needs. The wordmark is available in various sizes to suit different use
//         cases.
//       </Paragraph2>
//       <div className="text-4xl font-bold tracking-wide text-black dark:text-white">
//         meshjs.dev
//       </div>
//     </div>
//   );
// }

function Image({ img, bg }: { img: string; bg?: string }) {
  return (
    <div
      className={`grid max-w-sm content-around justify-around rounded-lg border border-neutral-200 shadow dark:border-neutral-700 ${bg}`}
    >
      <img className="h-48 rounded-t-lg" src={img} alt={img} />
    </div>
  );
}
