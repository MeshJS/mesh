import { Element } from 'react-scroll';

export default function SectionTwoCol({
  sidebarTo,
  header,
  leftFn,
  rightFn,
  isH3 = false,
  badge = <></>,
}) {
  return (
    <Element name={sidebarTo}>
      {isH3 ? (
        <h3>
          {header}
          {badge && <span className="ml-2">{badge}</span>}
        </h3>
      ) : (
        <h2>{header}</h2>
      )}
      <div className="grid grid-cols-1 px-4 lg:grid-cols-2 lg:gap-16 pb-16">
        <div className="col-span-1 xl:col-auto">{leftFn}</div>
        <div className="col-span-1">{rightFn}</div>
      </div>
    </Element>
  );
}
