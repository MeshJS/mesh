import { Prose } from "@/components/Prose";

export default function IntroContracts() {
  return (
    <article className="flex h-full flex-col pb-10 pt-16">
      <Prose className="flex-auto">
        <h1>Smart Contracts</h1>
        <p className="lead">
          Here's a list of open-source smart contracts, complete with documentation, live
          demos, and end-to-end source code.
        </p>
      </Prose>
    </article>
  );
}
