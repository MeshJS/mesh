import AddBadge from './addBadge';
import FollowTwitter from './followTwitter';
import JoinDiscord from './joinDiscord';
import SendAdaToSupport from './sendAdaToSupport';
import StarRepo from './starRepo';

export default function SupportUs() {
  return (
    <>
      <section className="bg-gray-50 dark:bg-gray-900">
        <div className="py-8 px-4 mx-auto max-w-screen-xl sm:py-16 lg:px-6">
          <div className="mx-auto max-w-screen-md text-center mb-8 lg:mb-16">
            <h2 className="mb-4 text-4xl tracking-tight font-extrabold text-gray-900 dark:text-white">
              You can support Mesh!
            </h2>
            <p className="font-light text-gray-500 dark:text-gray-400 sm:text-xl">
              Thank you for your interest in Mesh, we appreciate any kind of support!
              <br />
              Here are some ways you can support us.
            </p>
          </div>
        </div>
      </section>

      <FollowTwitter />
      <SendAdaToSupport />
      <StarRepo />
      <AddBadge />
      <JoinDiscord />
    </>
  );
}
