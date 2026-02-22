import Link from "~/components/link";
import { AboutSection } from "../";

export default function AboutStatus() {
  return (
    <AboutSection
      title="Status"
      description="Stay up to date with our latest releases, tests and build status."
    >
      <div className="grid gap-8 sm:gap-12 md:grid-cols-3">
        <div className="flex justify-center">
          <div>
            <h3 className="mb-1 text-lg font-semibold leading-tight text-neutral-900 dark:text-white">
              Published on NPM
            </h3>
            <Link href="https://www.npmjs.com/package/@meshsdk/core">
              <img src="https://img.shields.io/npm/v/%40meshsdk%2Fcore?style=for-the-badge" />
            </Link>
          </div>
        </div>
        <div className="flex justify-center">
          <div>
            <h3 className="mb-1 text-lg font-semibold leading-tight text-neutral-900 dark:text-white">
              Build status
            </h3>
            <Link href="https://github.com/meshjs/mesh/actions/workflows/build.yml">
              <img src="https://github.com/meshjs/mesh/actions/workflows/build.yml/badge.svg" />
            </Link>
          </div>
        </div>
        <div className="flex justify-center">
          <div>
            <h3 className="mb-1 text-lg font-semibold leading-tight text-neutral-900 dark:text-white">
              Publish status
            </h3>
            <Link href="https://github.com/meshjs/mesh/actions/workflows/publish.yml">
              <img src="https://github.com/meshjs/mesh/actions/workflows/publish.yml/badge.svg" />
            </Link>
          </div>
        </div>
      </div>
    </AboutSection>
  );
}
