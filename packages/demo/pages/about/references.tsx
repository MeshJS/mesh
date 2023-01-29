import type { NextPage } from 'next';
import Metatags from '../../components/site/metatags';

const ReferencesPage: NextPage = () => {
  return (
    <>
      <Metatags title="References" />
      <section className="bg-white dark:bg-gray-900">
        <div className="py-8 px-4 mx-auto max-w-screen-xl lg:py-16 lg:px-6">
          <div className="px-4 mx-auto mb-8 max-w-screen-md text-center md:mb-16 lg:px-0">
            <h2 className="mb-4 text-3xl tracking-tight font-extrabold text-gray-900 md:text-4xl dark:text-white">
              References
            </h2>
            <p className="font-light text-gray-500 sm:text-xl dark:text-gray-400 mb-4"></p>
            <div className="grid grid-cols-2 gap-4">
              <CardLink
                title="Mesh Intro and Q&A"
                desc="Catalyst Townhall Dec 2022"
                url="https://www.youtube.com/watch?v=YOBo39ZB_1Y"
              />
              <CardLink
                title="Mesh Playground and Q&A"
                desc="Catalyst Townhall Dec 2023"
                url="https://www.youtube.com/watch?v=BTYGcgK_2bc"
              />
              <CardLink
                title="Mesh: The Innovative Toolkit Empowering Building on Cardano"
                desc="AdaPulse"
                url="https://adapulse.io/introducing-mesh-the-innovative-toolkit-empowering-building-on-cardano/"
              />
              <CardLink
                title="The Revolutionary Mesh Developer Toolkit"
                desc="This Week In Cardano - Building on Cardano Made Easy"
                url="https://www.youtube.com/watch?v=1A_uBrqZx3Y"
              />
              <CardLink
                title="Building on Cardano: Book.io and Mesh"
                desc="Cardano360 - Anita Jovic Technical Community Manager at IOG"
                url="https://www.youtube.com/watch?v=SnTYKHDZ8rY"
              />
            </div>
          </div>
        </div>
      </section>
    </>
  );
};

export default ReferencesPage;

function CardLink({ title, desc, url }) {
  return (
    <a
      href={url}
      className="block max-w-sm p-6 bg-white border border-gray-200 rounded-lg shadow hover:bg-gray-100 dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700"
      target="_blank"
      rel="noreferrer"
    >
      <h5 className="mb-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
        {title}
      </h5>
      <p className="font-normal text-gray-700 dark:text-gray-400">{desc}</p>
    </a>
  );
}
