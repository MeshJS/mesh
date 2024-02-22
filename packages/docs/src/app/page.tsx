"use client"

import getClasses from '@/data/get-classes';
import data from '../data/api.json';
import getClassGroups from '@/data/get-class-groups';
import { Section } from '@/components/SectionProvider';

export default function Home() {

  const test = getClasses();
  // console.log(1, test)
  
  const allSectionsEntries = getClasses().map((meshClass: any) => {
    
    const _items:{id:string; title:string}[] = [];

    getClassGroups(meshClass.name).map((group: any) => {
      group.children.map((item: any) => {
        console.log(1, item)
        _items.push( {id: item.name, title: item.name})
      })
    })

    return [`/${meshClass.name}`, _items]
  })as Array<[string, Array<Section>]>

  console.log(9999, allSectionsEntries)


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
