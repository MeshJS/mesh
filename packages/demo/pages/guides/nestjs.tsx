import { Codeblock, Metatags } from '../../components';
import Link from 'next/link';
import Help from './help';

const Nestjs = () => {
  return (
    <>
      <Metatags title="Start a Node.js backend with NestJS" description="" />

      <section className="py-8 px-4 lg:py-16 lg:px-6">
        <h1>Start a Node.js backend with NestJS</h1>
        <p>
          <i>Coming soon... Anyone wanna contribute?</i>
        </p>

        {/* <Codeblock data={`npm i -g @nestjs/cli`} isJson={false} />

        <Codeblock data={`nest new .`} isJson={false} />

        `main.ts` change port to 5000

        To watch for changes in your files, you can run the following command to start the application:
        yarn run start:dev

        create transaction module, controller and service */}

        <Help />
      </section>
    </>
  );
};

export default Nestjs;
