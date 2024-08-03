import { CodeGroup } from "@/components/Code";
import { Prose } from "@/components/Prose";
import Markdown from "react-markdown";

export default function Home() {
  return (
    <article className="flex h-full flex-col pb-10 pt-16">
      <Prose className="flex-auto">
        <h1>Mesh Documentation</h1>
        <p className="lead">This is the official documentation for Mesh.</p>
        <p>
          Mesh goes above and beyond to enhance the accessibility and
          user-friendliness of Web3 development for developers, startups, and
          enterprises. One key aspect is the provision of well-organized APIs,
          spanning from wallet integrations to transaction building and smart
          contract interactions. To further facilitate a smooth onboarding
          process, Mesh offers comprehensive documentation complete with live
          demos, enabling developers to test functionalities before diving into
          coding.
        </p>
        <p>
          Additionally, Mesh enhances accessibility through the provision of
          starter kits, allowing users to set up a functional workspace in less
          than a minute and subsequently concentrate on refining the business
          logic of their applications. Collaborating closely with the community,
          Mesh takes an inclusive approach by running workshops and creating
          guides, fostering a supportive environment that helps developers
          seamlessly integrate into the Cardano ecosystem.
        </p>
        <h2 className="scroll-mt-24" id="getting-started">
          Getting started
        </h2>
        <p className="lead">
          To get started with Mesh, you need to install the latest version of
          Mesh with npm:
        </p>

        <CodeGroup title="" code={`npm install @meshsdk/core`}>
          <Markdown>npm install @meshsdk/core</Markdown>
        </CodeGroup>

        {/* <Resources /> */}
      </Prose>
    </article>
  );
}

/**
 * these commment codes are wip for the search
 */

// import getClassGroups from '@/data/get-class-groups';
// import getClasses from '@/data/get-classes';
// import { useEffect } from 'react';

// function getSectionComments(item: any) {
//   return item.comment
//     ? item.comment.summary.map((item) => {
//         return item.text;
//       })
//     : [];
// }

// useEffect(() => {
//   const searchClasses = getClasses().map((meshClass: any) => {

//     const _object: any = { url: `/classes/${meshClass.name}`, sections: [] };

//     const _sections: any = [];

//     const _sectionComments = getSectionComments(meshClass);

//     const _section = [meshClass.name, null, _sectionComments];

//     _sections.push(_section);


//     getClassGroups(meshClass.name).map((group: any) => {
//       group.children.map((item: any) => {

//         item.signatures?.map((signature: any) => {
//           const _sectionComments = getSectionComments(signature);
//           const _section = [item.name, item.name, _sectionComments];
//           _sections.push(_section);
//         });
//       });
//     });

//     _object.sections = _sections;

//     return _object;
//   });

// }, []);
