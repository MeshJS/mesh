import HeaderAndCards from "~/components/layouts/header-and-cards";
import Link from "~/components/link";
import Metatags from "~/components/site/metatags";
import { metaMediaKit } from "~/data/links-about";

export default function Media() {
  return (
    <>
      <Metatags title={metaMediaKit.title} description={metaMediaKit.desc} />
      <HeaderAndCards
        headerTitle={metaMediaKit.title}
        headerParagraph={metaMediaKit.desc}
      />
      <div className="mx-auto max-w-screen-lg px-4 py-8 lg:px-6 lg:py-16">
        <div className="grid grid-cols-4 gap-4">
          <Image img="/logo-mesh/black/logo-mesh-black-16x16.png" />
          <Image img="/logo-mesh/black/logo-mesh-black-32x32.png" />
          <Image img="/logo-mesh/black/logo-mesh-black-64x64.png" />
          <Image img="/logo-mesh/black/logo-mesh-black-128x128.png" />
          <Image img="/logo-mesh/black/logo-mesh-black-256x256.png" />
          <Image img="/logo-mesh/black/logo-mesh-black-512x512.png" />
          <Image img="/logo-mesh/white/logo-mesh-white-16x16.png" />
          <Image img="/logo-mesh/white/logo-mesh-white-32x32.png" />
          <Image img="/logo-mesh/white/logo-mesh-white-64x64.png" />
          <Image img="/logo-mesh/white/logo-mesh-white-128x128.png" />
          <Image img="/logo-mesh/white/logo-mesh-white-256x256.png" />
          <Image img="/logo-mesh/white/logo-mesh-white-512x512.png" />
          <Image img="/logo-mesh/mesh.png" />
          <Image img="/logo-mesh/meshlogo-with-title-white.svg" />
          <Image img="/logo-mesh/meshlogo-with-title-black.svg" />
        </div>
      </div>
    </>
  );
}

function Image({ img }: { img: string }) {
  return (
    <>
      <div className="grid max-w-sm content-around justify-around rounded-lg border border-neutral-200 bg-neutral-200 shadow dark:border-neutral-700 dark:bg-neutral-800">
        <Link href={img} target="blank">
          <img className="h-36 rounded-t-lg object-cover" src={img} alt={img} />
        </Link>
      </div>
    </>
  );
}
