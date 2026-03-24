"use client";
import { Prose } from "@/components/Prose";
import { Content, DefinedIn, Header, ItemSignatures } from "@/components/docs";
import { useRouteContext } from "@/contexts/route-context";
import getFunction from "@/data/get-function";

export default function Page({ params }: { params: { name: string } }) {
  const { currentRoute } = useRouteContext();

  const meshFunction = getFunction(params.name, currentRoute);

  if (meshFunction === undefined) {
    return <></>;
  }

  return (
    <article className="flex h-full flex-col pb-10 pt-16">
      <Prose className="flex-auto">
        <Header meshObject={meshFunction} />
        <Content comment={meshFunction.comment} isMain={true} />

        <ItemSignatures child={meshFunction} />

        <DefinedIn sources={meshFunction.sources} />
      </Prose>
    </article>
  );
}
