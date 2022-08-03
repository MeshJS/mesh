import { Codeblock, Metatags } from '../../components';
import Link from 'next/link';
import Help from './help';

const Nextjs = () => {
  return (
    <>
      <Metatags title="Coming soon" description="" />

      <section className="py-8 px-4 lg:py-16 lg:px-6">
        <h1>Coming soon...</h1>
        <p>
          <i>Open for contributions</i>
        </p>

        <Help />
      </section>
    </>
  );
};

export default Nextjs;
