import { Prose } from '@/components/Prose';
import getType from '@/data/get-type';

export default function Page({ params }: { params: { name: string } }) {
  const meshType = getType(params.name);
  console.log(meshType);

  return (
    <article className="flex h-full flex-col pb-10 pt-16">
      <Prose className="flex-auto">
        <Header meshType={meshType} />
      </Prose>
    </article>
  );
}

function Header({ meshType }) {
  return (
    <div className="flex gap-2 items-center">
      <h1>{meshType.name}</h1>
      {/* {meshType.implementedTypes && (
        <div className="flex gap-1">
          <span>implements</span>
          {meshClass.implementedTypes.map((implementedType: any, i: number) => {
            return (
              <span key={uuidv4()}>
                <a href={`/inteface/${implementedType.name}`}>
                  {implementedType.name}
                </a>
              </span>
            );
          })}
        </div>
      )} */}
    </div>
  );
}
