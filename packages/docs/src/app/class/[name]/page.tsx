'use client';

import getClass from '@/data/get-class';
import { Prose } from '@/components/Prose';
import getClassGroups from '@/data/get-class-groups';
import Markdown from 'react-markdown';
import { Properties, Property } from '@/components/mdx';
import { Code, CodeGroup, Pre } from '@/components/Code';
import getClassChildren from '@/data/get-class-children';

export default function Page({ params }: { params: { name: string } }) {
  const meshClass = getClass(params.name);
  const meshGroup = getClassGroups(meshClass.name);

  return (
    <article className="flex h-full flex-col pb-10 pt-16">
      <Prose className="flex-auto">
        <Header meshClass={meshClass} />
        <Content comment={meshClass.comment} isMain={true} />

        {meshClass.sources.map((source, i) => {
          return (
            <span key={`key${i}`}>
              Defined in{' '}
              <a href={source.url} target="_blank">
                {source.fileName}:{source.line}
              </a>
            </span>
          );
        })}

        {meshGroup.map((group, i) => {
          return <Group group={group} key={`group${i}`} />;
        })}
      </Prose>
      {/* <footer className="mx-auto mt-16 w-full max-w-2xl lg:max-w-5xl">
        <Feedback />
      </footer> */}
    </article>
  );
}

function Header({ meshClass }) {
  return (
    <div className="flex gap-2 items-center">
      <h1>{meshClass.name}</h1>
      {meshClass.implementedTypes && (
        <div className="flex gap-1">
          <span>implements</span>
          {meshClass.implementedTypes.map((implementedType: any, i: number) => {
            return (
              <span key={`implementedType${i}`}>
                <a href={`/inteface/${implementedType.name}`}>
                  {implementedType.name}
                </a>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Group({ group }) {
  return (
    <>
      {group.children.map((child, i) => {
        console.log(2, child);
        return <Item key={`child${i}`} child={child} />;
      })}
    </>
  );
}

function Item({ child }) {
  return (
    <div>
      <ItemHeader child={child} />
      <ItemSignatures child={child} />
    </div>
  );
}

function ItemSignatures({ child }) {
  return (
    <>
      {child.signatures.map((signature, i) => {
        let code = ``;
        code += signature.name;
        code += `(`;
        code += signature.parameters
          .map((param, i) => {
            return `${param.name}: ${param.type.name}`;
          })
          .join(', ');
        code += `)`;
        // code += `: ${signature.type.name}`;
        // signature.type.typeArguments &&
        //   signature.type.typeArguments.map((typeArg, i) => {
        //     code += `<${typeArg.name}>`;
        //   });

        return (
          <div key={`sign${i}`}>
            <Content comment={signature.comment} />

            <KindCode text={code} />

            <Properties>
              {signature.parameters.map((param, j) => (
                <Property
                  name={`${param.name}: ${param.type.name}`}
                  key={`params${i}${j}`}
                >
                  <Content comment={param.comment} />
                </Property>
              ))}
            </Properties>

            {/* <div className="flex gap-2">
              <b>Returns</b>
              <a>
                {signature.type.name}
                {signature.type.typeArguments &&
                  signature.type.typeArguments.map((typeArg, i) => {
                    console.log(333, child.name, typeArg.target)
                    // const target = getClassChildren(child.name, typeArg.target);
                    // console.log(444, target)
                    return `<${typeArg.name}>`;
                  })}
              </a>
            </div> */}

            <span>
              Defined in{' '}
              <a href={child.sources[i].url} target="_blank">
                {child.sources[i].fileName}:{child.sources[i].line}
              </a>
            </span>
          </div>
        );
      })}
    </>
  );
}

function ItemHeader({ child }) {
  return (
    <h2 className="scroll-mt-24" id={child.name}>
      <a
        className="group text-inherit no-underline hover:text-inherit"
        href={`#${child.name}`}
      >
        <div className="absolute ml-[calc(-1*var(--width))] mt-1 hidden w-[var(--width)] opacity-0 transition [--width:calc(2.625rem+0.5px+50%-min(50%,calc(theme(maxWidth.lg)+theme(spacing.8))))] group-hover:opacity-100 group-focus:opacity-100 md:block lg:z-50 2xl:[--width:theme(spacing.10)]">
          <div className="group/anchor block h-5 w-5 rounded-lg bg-zinc-50 ring-1 ring-inset ring-zinc-300 transition hover:ring-zinc-500 dark:bg-zinc-800 dark:ring-zinc-700 dark:hover:bg-zinc-700 dark:hover:ring-zinc-600">
            <svg
              viewBox="0 0 20 20"
              fill="none"
              strokeLinecap="round"
              aria-hidden="true"
              className="h-5 w-5 stroke-zinc-500 transition dark:stroke-zinc-400 dark:group-hover/anchor:stroke-white"
            >
              <path d="m6.5 11.5-.964-.964a3.535 3.535 0 1 1 5-5l.964.964m2 2 .964.964a3.536 3.536 0 0 1-5 5L8.5 13.5m0-5 3 3"></path>
            </svg>
          </div>
        </div>
        {child.name}
      </a>
    </h2>
  );
}

function Content({ comment, isMain = false }) {
  return (
    <>
      {comment &&
        comment.summary &&
        comment.summary.map((item, i) => {
          switch (item.kind) {
            case 'text':
              return <KindText text={item.text} key={i} isLeadClass={isMain} />;
            case 'code':
              return <KindCode text={item.text} key={i} />;
            default:
              return null;
          }
        })}
    </>
  );
}

function KindText({
  text,
  isLeadClass = false,
}: {
  text: string;
  isLeadClass?: boolean;
}) {
  return <Markdown className={isLeadClass ? 'lead' : ''}>{text}</Markdown>;
}

function KindCode({ text }: { text: string }) {
  return (
    <CodeGroup title="" code={text}>
      <Markdown>{text}</Markdown>
    </CodeGroup>
  );
}
