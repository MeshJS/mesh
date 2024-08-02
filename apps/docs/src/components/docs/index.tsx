import Markdown from 'react-markdown';
import { Properties, Property } from '@/components/mdx';
import { CodeGroup } from '@/components/Code';
import { v4 as uuidv4 } from 'uuid';
import { Fragment } from 'react';
import Link from 'next/link';

export function Header({ meshObject }) {
  return (
    <div className="flex gap-2 items-center">
      <h1>{meshObject.name}</h1>
      {meshObject.implementedTypes && (
        <div className="flex gap-1">
          <span>implements</span>
          {meshObject.implementedTypes.map((implementedType: any) => {
            return (
              <span key={uuidv4()}>
                <Link href={`/interfaces/${implementedType.name}`}>
                  {implementedType.name}
                </Link>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Group({ group }) {
  return (
    <>
      {group.children.map((child, i) => {
        return <Item key={uuidv4()} child={child} />;
      })}
    </>
  );
}

export function Item({ child }) {
  return (
    <div>
      <ItemHeader child={child} />
      <ItemSignatures child={child} />

      <DefinedIn sources={child.sources} />
    </div>
  );
}

export function ItemSignatures({ child }) {
  return (
    <>
      {child.signatures &&
        child.signatures.map((signature, i) => {
          let code = ``;

          const isPromise = signature.type.name == 'Promise';
          if (isPromise) {
            code += `await `;
          }

          code += signature.name;

          code += `(`;

          if (signature.parameters) {
            code += signature.parameters
              .map((param, i) => {
                if (
                  param.type.type == 'reference' ||
                  param.type.type == 'intrinsic'
                ) {
                  return `${param.name}: [${param.type.name}](/types/${param.type.name})`;
                }
                if (param.type.type == 'array') {
                  return `${param.name}: ${param.type.elementType.name}[]`;
                }
                if (param.type.type == 'union') {
                  return (
                    `${param.name}: ` +
                    param.type.types
                      .map((type, j) => {
                        return type.value;
                      })
                      .join(' | ')
                  );
                }
              })
              .join(', ');
          }

          code += `)`;

          return (
            <div key={uuidv4()}>
              <KindCode text={code} />
              <Content comment={signature.comment} />

              <div className="grid grid-cols-2 gap-2">
                {signature.parameters && (
                  <div>
                    <b>Parameters</b>
                    <Parameters signature={signature} />
                  </div>
                )}

                <div>
                  <b>Returns</b>
                  <Return signature={signature} />
                </div>
              </div>
            </div>
          );
        })}
    </>
  );
}

export function Parameters({ signature }) {
  return (
    <Properties>
      {signature.parameters.map((param, j) => {
        let type = ``;
        if (param.type.name) {
          type = param.type.name;
        }
        if (param.defaultValue) {
          type += ` (default: ${param.defaultValue})`;
        }

        return (
          <Property
            name={param.name}
            key={uuidv4()}
            type={type}
            data={param.type}
          >
            <Content comment={param.comment} />
          </Property>
        );
      })}
    </Properties>
  );
}

export function Return({ signature }) {
  const isPromise = signature.type.name == 'Promise';

  return (
    <Properties>
      <>
        {!isPromise && (
          <>
            {(signature.type.type == 'reference' ||
              signature.type.type == 'intrinsic') && (
              <Property
                key={uuidv4()}
                type={signature.type.name}
                data={signature.type}
                isPromise={isPromise}
              >
                <></>
              </Property>
            )}
            {/* {signature.type.type == 'array' && (
              <Property
                key={uuidv4()}
                type={signature.type.elementType.name}
                isPromise={isPromise}
                isArray={true}
                data={signature.type.elementType}
              >
                <></>
              </Property>
            )} */}
          </>
        )}
        {signature.type.typeArguments && (
          <>
            {signature.type.typeArguments.map((typeArg, i) => {
              if (typeArg.type == 'reference' || typeArg.type == 'intrinsic') {
                return (
                  <Property
                    key={uuidv4()}
                    type={typeArg.name}
                    data={typeArg}
                    isPromise={isPromise}
                  >
                    <></>
                  </Property>
                );
              }

              if (typeArg.type == 'array') {
                const element = typeArg.elementType;
                if (element.type == 'reference') {
                  return (
                    <Property
                      key={uuidv4()}
                      type={element.name}
                      data={element}
                      isPromise={isPromise}
                      isArray={true}
                    >
                      <></>
                    </Property>
                  );
                }
                if (element.type == 'reflection') {
                  return (
                    <Fragment key={uuidv4()}>
                      {typeArg.elementType.declaration.children.map(
                        (child, j) => {
                          return (
                            <Property
                              name={child.name}
                              key={uuidv4()}
                              type={child.type.name}
                              isPromise={isPromise}
                            >
                              <></>
                            </Property>
                          );
                        }
                      )}
                    </Fragment>
                  );
                }
              }
            })}
          </>
        )}
      </>
    </Properties>
  );
}

export function ItemHeader({ child }) {
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

export function Content({ comment, isMain = false }) {
  return (
    <>
      {comment &&
        comment.summary &&
        comment.summary.map((item, i) => {
          switch (item.kind) {
            case 'text':
              return (
                <KindText
                  text={item.text}
                  key={uuidv4()}
                  isLeadClass={isMain}
                />
              );
            case 'code':
              return <KindCode text={item.text} key={uuidv4()} />;
            default:
              return null;
          }
        })}
    </>
  );
}

export function KindText({
  text,
  isLeadClass = false,
}: {
  text: string;
  isLeadClass?: boolean;
}) {
  return <Markdown className={isLeadClass ? 'lead' : ''}>{text}</Markdown>;
}

export function KindCode({ text }: { text: string }) {
  return (
    <CodeGroup title="" code={text}>
      <Markdown>{text}</Markdown>
    </CodeGroup>
  );
}

export function DefinedIn({
  sources,
}: {
  sources: { url: string; fileName: string; line: number }[];
}) {
  if (sources)
    return (
      <div className="flex flex-col">
        <>Defined in </>
        {sources.map((source, i) => {
          return (
            <li className="m-0" key={uuidv4()}>
              <a href={source.url} target="_blank">
                {source.fileName}:{source.line}
              </a>
            </li>
          );
        })}
      </div>
    );

  return null;
}

export function ImplementedBy({
  implementedBy,
}: {
  implementedBy: { name: string }[];
}) {
  if (implementedBy)
    return (
      <div className="flex flex-col">
        <span>Implemented by</span>
        {implementedBy.map((implementedBy: any) => {
          return (
            <li key={uuidv4()} className="m-0">
              <Link href={`/classes/${implementedBy.name}`}>
                {implementedBy.name}
              </Link>
            </li>
          );
        })}
      </div>
    );
  return null;
}

export function TypeDeclaration({ meshType }: { meshType: any }) {
  return (
    <div>
      <b>Type declaration</b>
      <Properties>
        {meshType.type.declaration &&
          meshType.type.declaration.children.map((typeDeclaration: any) => {
            return (
              <Property
                key={uuidv4()}
                name={typeDeclaration.name}
                type={typeDeclaration.type.name}
                data={typeDeclaration.type}
              >
                <>
                  {typeDeclaration.type.declaration && (
                    <div className="mx-4">
                      {typeDeclaration.type.declaration.children.map(
                        (typeDeclaration2: any) => {
                          return (
                            <Property
                              key={uuidv4()}
                              name={typeDeclaration2.name}
                              type={typeDeclaration2.type.name}
                              data={typeDeclaration2.type}
                            >
                              <></>
                            </Property>
                          );
                        }
                      )}
                    </div>
                  )}
                </>
              </Property>
            );
          })}
        {meshType.type.type == 'intrinsic' && (
          <Property
            key={uuidv4()}
            name={meshType.name}
            type={meshType.type.name}
          >
            <></>
          </Property>
        )}

        {meshType.type.objectType && meshType.type.objectType.queryType && (
          <Property
            key={uuidv4()}
            name={meshType.type.objectType.queryType.name}
            type={meshType.type.objectType.queryType.name}
            data={meshType.type.objectType.queryType}
          >
            <></>
          </Property>
        )}
      </Properties>
    </div>
  );
}
