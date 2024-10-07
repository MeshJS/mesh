import AboutHero from "./about-us/hero";
import AboutIncorporation from "./about-us/incorporation";
// import AboutMeeting from "./about-us/meeting";
import AboutStatus from "./about-us/status";
import AboutTeam from "./about-us/team";

export default function AboutPage() {
  return (
    <>
      <AboutHero />
      {/* <AboutMeeting /> */}
      <AboutTeam />
      <AboutIncorporation />
      <AboutStatus />
    </>
  );
}

export function AboutSection({
  children,
  title,
  description,
}: {
  children: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <section className="bg-white dark:bg-gray-900">
      <div className="mx-auto max-w-screen-xl px-4 py-8 text-center lg:px-6 lg:py-16">
        <div className="mx-auto mb-8 flex max-w-screen-sm flex-col gap-4">
          <h2 className="text-4xl font-extrabold tracking-tight text-gray-900 dark:text-white">
            {title}
          </h2>
          <p className="font-light text-gray-500 sm:text-xl dark:text-gray-400">
            {description}
          </p>
        </div>
        {children}
      </div>
    </section>
  );
}
