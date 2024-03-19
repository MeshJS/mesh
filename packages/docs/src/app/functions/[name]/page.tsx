import { Prose } from '@/components/Prose';
import getFunction from '@/data/get-function';

export default function Page({ params }: { params: { name: string } }) {
  const meshFunction = getFunction(params.name);
  console.log(meshFunction);

  return (
    <article className="flex h-full flex-col pb-10 pt-16">
      <Prose className="flex-auto">
        <Header meshFunction={meshFunction} />
      </Prose>
    </article>
  );
}

function Header({ meshFunction }) {
  return (
    <div className="flex gap-2 items-center">
      <h1>{meshFunction.name}</h1>
      {/* {meshFunction.implementedFunctions && (
        <div className="flex gap-1">
          <span>implements</span>
          {meshClass.implementedFunctions.map((implementedFunction: any, i: number) => {
            return (
              <span key={uuidv4()}>
                <a href={`/inteface/${implementedFunction.name}`}>
                  {implementedFunction.name}
                </a>
              </span>
            );
          })}
        </div>
      )} */}
    </div>
  );
}
