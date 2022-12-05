import type { NextPage } from 'next';
import Metatags from '../../components/site/metatags';
import {
  ChatBubbleLeftRightIcon,
  CreditCardIcon,
  FaceSmileIcon,
} from '@heroicons/react/24/solid';

const AboutConnectPage: NextPage = () => {
  return (
    <>
      <Metatags title="Connect" />
      <section className="bg-gray-50 dark:bg-gray-900">
        <div className="py-8 px-4 mx-auto max-w-screen-xl sm:py-16 lg:px-6">
          <div className="mx-auto max-w-screen-md text-center mb-8 lg:mb-16">
            <h2 className="mb-4 text-4xl tracking-tight font-extrabold text-gray-900 dark:text-white">
              Let's connect.
            </h2>
            {/* <p className="font-light text-gray-500 dark:text-gray-400 sm:text-xl">
              I'm glad you are here.
            </p> */}
          </div>

          <div className="space-y-8 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-8 xl:gap-8 md:space-y-0">
            <a
              href="https://twitter.com/jinglescode"
              rel="noreferrer"
              target="_blank"
            >
              <div className="m-6 p-6 bg-white rounded shadow dark:bg-gray-800">
                <div className="flex justify-center items-center mb-4 w-10 h-10 rounded bg-primary-100 lg:h-12 lg:w-12 dark:bg-primary-900">
                  <FaceSmileIcon className="w-5 h-5 text-primary-600 lg:w-6 lg:h-6 dark:text-primary-300" />
                </div>
                <h3 className="mb-2 text-xl font-bold dark:text-white">
                  Connect on me
                </h3>
                <p className="font-light text-gray-500 dark:text-gray-400">
                  We can connect and chat about collaboration.
                </p>
              </div>
            </a>

            <a
              href="https://twitter.com/meshsdk"
              rel="noreferrer"
              target="_blank"
            >
              <div className="m-6 p-6 bg-white rounded shadow dark:bg-gray-800">
                <div className="flex justify-center items-center mb-4 w-10 h-10 rounded bg-primary-100 lg:h-12 lg:w-12 dark:bg-primary-900">
                  <CreditCardIcon className="w-5 h-5 text-primary-600 lg:w-6 lg:h-6 dark:text-primary-300" />
                </div>
                <h3 className="mb-2 text-xl font-bold dark:text-white">
                  Connect with project
                </h3>
                <p className="font-light text-gray-500 dark:text-gray-400">
                  Follow and get updates on the latest development.
                </p>
              </div>
            </a>

            <a
              href="https://discord.gg/Z6AH9dahdH"
              rel="noreferrer"
              target="_blank"
            >
              <div className="m-6 p-6 bg-white rounded shadow dark:bg-gray-800">
                <div className="flex justify-center items-center mb-4 w-10 h-10 rounded bg-primary-100 lg:h-12 lg:w-12 dark:bg-primary-900">
                  <ChatBubbleLeftRightIcon className="w-5 h-5 text-primary-600 lg:w-6 lg:h-6 dark:text-primary-300" />
                </div>
                <h3 className="mb-2 text-xl font-bold dark:text-white">
                  Join Discord
                </h3>
                <p className="font-light text-gray-500 dark:text-gray-400">
                  Chat with the team, discuss, ask questions.
                </p>
              </div>
            </a>
          </div>
        </div>
      </section>
    </>
  );
};

export default AboutConnectPage;
