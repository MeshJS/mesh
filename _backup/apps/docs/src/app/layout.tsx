import "@/styles/tailwind.css";

import { Providers } from "@/app/providers";
import { Layout } from "@/components/Layout";

import { type Metadata } from "next";
import { RouteChangeListener } from "@/components/route-change-listener";
// import { type Section } from "@/components/SectionProvider";
// import getClasses from "@/data/get-classes";
// import getClassGroups from "@/data/get-class-groups";
// import getInterfaces from "@/data/get-interfaces";
// import getInterfaceGroups from "@/data/get-interface-groups";
// import { useRouteContext } from "@/contexts/route-context";

export const metadata: Metadata = {
  title: {
    template: "%s - Mesh SDK API Reference",
    default: "Mesh SDK API Reference",
  },
};

export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { package: string };
}) {
  // const {currentRoute} = useRouteContext();

  // let pages = await glob('**/*.mdx', { cwd: 'src/app' })
  // let allSectionsEntries = (await Promise.all(
  //   pages.map(async (filename) => [
  //     '/' + filename.replace(/(^|\/)page\.mdx$/, ''),
  //     (await import(`./${filename}`)).sections,
  //   ]),
  // )) as Array<[string, Array<Section>]>
  // let allSections = Object.fromEntries(allSectionsEntries)

  //////

  // // get all classes
  // const allSectionsEntries = getClasses().map((meshClass: any) => {
  //   const _items: { id: string; title: string }[] = [];

  //   getClassGroups(meshClass.name).map((group: any) => {
  //     group.children.map((item: any) => {
  //       _items.push({ id: item.name, title: item.name });
  //     });
  //   });

  //   return [`/classes/${meshClass.name}`, _items];
  // }) as Array<[string, Array<Section>]>;

  // // get all interfaces
  // const allInterfaces = getInterfaces().map((meshInterfaces: any) => {
  //   const _items: { id: string; title: string }[] = [];

  //   getInterfaceGroups(meshInterfaces.name).map((group: any) => {
  //     group.children.map((item: any) => {
  //       _items.push({ id: item.name, title: item.name });
  //     });
  //   });

  //   return [`/interfaces/${meshInterfaces.name}`, _items];
  // }) as Array<[string, Array<Section>]>;

  // if (allInterfaces) allSectionsEntries.push(...allInterfaces);

  // let allSections = Object.fromEntries(allSectionsEntries);

  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
      </head>
      <body className="flex min-h-full bg-white antialiased dark:bg-zinc-900">
        <Providers>
          <div className="w-full">
            <Layout>{children}</Layout>
          </div>
          <RouteChangeListener />
        </Providers>
      </body>
    </html>
  );
}
