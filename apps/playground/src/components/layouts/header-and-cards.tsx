import CardTitleDescImage from "~/components/card/card-title-desc-image";
import CenterAlignHeaderParagraph from "~/components/sections/center-align-header-paragraph";
import { MenuItem } from "~/types/menu-item";
import CenterPadded from "./root/center-padded";

export default function HeaderAndCards({
  headerTitle,
  headerParagraph,
  listCards,
}: {
  headerTitle: string;
  headerParagraph?: string;
  listCards?: MenuItem[];
}) {
  return (
    <CenterPadded>
      {headerParagraph && (
        <CenterAlignHeaderParagraph headerTitle={headerTitle}>
          {headerParagraph}
        </CenterAlignHeaderParagraph>
      )}
      {listCards && (
        <div className="mb-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {listCards.map((item, i) => {
            return (
              <CardTitleDescImage
                title={item.title}
                desc={item.desc}
                link={item.link}
                thumbnailHeroicon={item.icon}
                thumbnailImage={item.thumbnail}
                key={i}
              />
            );
          })}
        </div>
      )}
    </CenterPadded>
  );
}
