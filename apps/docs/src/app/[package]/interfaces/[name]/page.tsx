"use client";
import { Prose } from "@/components/Prose";
import {
  Content,
  DefinedIn,
  Group,
  Header,
  ImplementedBy,
} from "@/components/docs";
import { useRouteContext } from "@/contexts/route-context";
import getInterface from "@/data/get-interface";
import getInterfaceGroups from "@/data/get-interface-groups";
import { v4 as uuidv4 } from "uuid";

export default function Page({ params }: { params: { name: string } }) {
  const { currentRoute } = useRouteContext();

  const meshInterface = getInterface(params.name, currentRoute);
  const group = getInterfaceGroups(meshInterface?.name, currentRoute);

  if (meshInterface === undefined) {
    return <></>;
  }

  return (
    <article className="flex h-full flex-col pb-10 pt-16">
      <Prose className="flex-auto">
        <Header meshObject={meshInterface} />
        <Content comment={meshInterface.comment} isMain={true} />

        <ImplementedBy implementedBy={meshInterface.implementedBy} />
        <DefinedIn sources={meshInterface.sources} />

        {group.map((group, i) => {
          return <Group group={group} key={uuidv4()} />;
        })}
      </Prose>
    </article>
  );
}
