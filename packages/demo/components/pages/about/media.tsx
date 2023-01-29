
export default function Media() {
  return (
    <>
      <section className="bg-white dark:bg-gray-900">
        <div className="py-8 px-4 mx-auto max-w-screen-xl lg:py-16 lg:px-6">
          <div className="px-4 mx-auto mb-8 max-w-screen-md text-center md:mb-16 lg:px-0">
            <h2 className="mb-4 text-3xl tracking-tight font-extrabold text-gray-900 md:text-4xl dark:text-white">
              Media Kit
            </h2>
            <p className="font-light text-gray-500 sm:text-xl dark:text-gray-400 mb-4">
              Choose from these logo files. These resources exist to
              help you use Mesh's assets.
            </p>
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
            </div>
          </div>
        </div>
        
      </section>
    </>
  );
}

function Image({ img }) {
  return (
    <>
      <div className="max-w-sm bg-gray-200 border border-gray-200 rounded-lg shadow dark:bg-gray-800 dark:border-gray-700 grid justify-around content-around">
        <a href={img} target="_blank" rel="noreferrer">
          <img className="rounded-t-lg" src={img} alt={img} />
        </a>
      </div>
    </>
  );
}
