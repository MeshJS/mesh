"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";

import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Logo } from "@/components/Logo";
import { Navigation } from "@/components/Navigation";
import { type Section, SectionProvider } from "@/components/SectionProvider";

import getClasses from "@/data/get-classes";
import getClassGroups from "@/data/get-class-groups";
import getInterfaces from "@/data/get-interfaces";
import getInterfaceGroups from "@/data/get-interface-groups";
import { useRouteContext } from "@/contexts/route-context";
import { useEffect, useState } from "react";

export function Layout({ children }: { children: React.ReactNode }) {
  const [allSections, setAllSections] = useState<{}>({});
  const { currentRoute } = useRouteContext();

  let pathname = usePathname();

  useEffect(() => {
    // get all classes
    const allSectionsEntries = getClasses(currentRoute).map(
      (meshClass: any) => {
        const _items: { id: string; title: string }[] = [];

        getClassGroups(meshClass.name, currentRoute).map((group: any) => {
          group.children.map((item: any) => {
            _items.push({ id: item.name, title: item.name });
          });
        });

        return [`/${currentRoute}/classes/${meshClass.name}`, _items];
      }
    ) as Array<[string, Array<Section>]>;

    // get all interfaces
    const allInterfaces = getInterfaces(currentRoute).map(
      (meshInterfaces: any) => {
        const _items: { id: string; title: string }[] = [];

        getInterfaceGroups(meshInterfaces.name, currentRoute).map(
          (group: any) => {
            group.children.map((item: any) => {
              _items.push({ id: item.name, title: item.name });
            });
          }
        );

        return [`/${currentRoute}/interfaces/${meshInterfaces.name}`, _items];
      }
    ) as Array<[string, Array<Section>]>;

    if (allInterfaces) allSectionsEntries.push(...allInterfaces);

    let _allSections = Object.fromEntries(allSectionsEntries);
    setAllSections(_allSections);
  }, [currentRoute]);

  return (
    <SectionProvider sections={allSections[pathname] ?? []}>
      <div className="h-full lg:ml-72 xl:ml-80">
        <motion.header
          layoutScroll
          className="contents lg:pointer-events-none lg:fixed lg:inset-0 lg:z-40 lg:flex"
        >
          <div className="contents lg:pointer-events-auto lg:block lg:w-72 lg:overflow-y-auto lg:border-r lg:border-zinc-900/10 lg:px-6 lg:pb-8 lg:pt-4 xl:w-80 lg:dark:border-white/10">
            <div className="hidden lg:flex">
              <Link href="/" aria-label="Home">
                <Logo className="h-6" />
              </Link>
            </div>
            <Header />
            <Navigation className="hidden lg:mt-10 lg:block" />
          </div>
        </motion.header>
        <div className="relative flex h-full flex-col px-4 pt-14 sm:px-6 lg:px-8">
          <main className="flex-auto">{children}</main>
          <Footer />
        </div>
      </div>
    </SectionProvider>
  );
}
