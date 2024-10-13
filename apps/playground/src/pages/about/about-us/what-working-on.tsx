import Link from "~/components/link";
import { AboutSection } from "../";

export default function AboutWhatWorkingOn() {
  return (
    <AboutSection
      title="What are we working on?"
      description={
        <>
          Check out our{" "}
          <Link href="https://github.com/MeshJS/mesh/milestones">
            GitHub milestones
          </Link>{" "}
          to see what we are currently working on.
        </>
      }
    >
      <></>
    </AboutSection>
  );
}
