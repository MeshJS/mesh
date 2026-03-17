"use client";
import { Prose } from "@/components/Prose";
import { Content, DefinedIn, Header, TypeDeclaration } from "@/components/docs";
import { useRouteContext } from "@/contexts/route-context";
import getType from "@/data/get-type";

export default function Page({ params }: { params: { name: string } }) {
  const { currentRoute } = useRouteContext();

  const meshType = getType(params.name, currentRoute);

  if (meshType === undefined) {
    return <></>;
  }

  return (
    <article className="flex h-full flex-col pb-10 pt-16">
      <Prose className="flex-auto">
        <Header meshObject={meshType} />
        <Content comment={meshType.comment} isMain={true} />

        <TypeDeclaration meshType={meshType} />

        <DefinedIn sources={meshType.sources} />
      </Prose>
    </article>
  );
}
