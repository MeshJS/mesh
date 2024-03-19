'use client';

export default function Home() {
  return (
    <>
      <ListChildren />
    </>
  );
}

function ListChildren() {
  return (
    <>
      {/* {data['children'].map((child, index) => {
        return <Children key={index} child={child} />;
      })} */}
    </>
  );
}

function Children({ child }: { child: any }) {
  return (
    <div className="flex flex-col gap-4 border border-white">
      <div>Class {child.name}</div>
      <div>
        Defined in{` `}
        <a href={child.sources[0].url} target="_blank">
          {child.sources[0].fileName}
        </a>
      </div>

      {child.implementedTypes && (
        <div>
          <span>Implements</span>
          <ul>
            {child.implementedTypes.map((type: any, index: number) => {
              return (
                <li key={index}>
                  - <a href={type.target}>{type.name}</a>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {child.groups &&
        child.groups.map((group: any, index: number) => {
          return (
            <div key={index} className="flex flex-col gap-4">
              <div>{group.title}</div>

              <div className="grid grid-cols-3">
                {group.children.map((id: any, index: number) => {
                  const item = child.children.find((x: any) => x.id === id);
                  return (
                    <a key={id} href={`#${item.name}`}>
                      {item.name}
                    </a>
                  );
                })}
              </div>
            </div>
          );
        })}
    </div>
  );
}
