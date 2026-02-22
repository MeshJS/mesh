import Metatags from "~/components/site/metatags";
import AboutHero from "./about-us/hero";
import AboutIncorporation from "./about-us/incorporation";
// import AboutMeeting from "./about-us/meeting";
import AboutStatus from "./about-us/status";
import AboutTeam from "./about-us/team";
import AboutWhatWorkingOn from "./about-us/what-working-on";

export default function AboutPage() {
  return (
    <>
      <Metatags title="About Mesh SDK" />
      <AboutHero />
      <AboutTeam />
      {/* <AboutMeeting /> */}
      <AboutWhatWorkingOn />
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
  description: React.ReactNode;
}) {
  return (
    <section>
      <div className="mx-auto max-w-screen-xl px-4 py-8 text-center lg:px-6 lg:py-16">
        <div className="mx-auto mb-8 flex max-w-screen-sm flex-col gap-4">
          <h2 className="text-4xl font-extrabold tracking-tight text-neutral-900 dark:text-white">
            {title}
          </h2>
          <div className="font-light text-neutral-500 sm:text-xl dark:text-neutral-400">
            {description}
          </div>
        </div>
        {children}
      </div>
    </section>
  );
}
