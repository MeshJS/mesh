import Header2 from "~/components/text/header2";
import Paragraph2 from "~/components/text/paragraph2";

export default function CenterAlignHeaderParagraph({
  children,
  headerTitle,
}: {
  children: React.ReactNode;
  headerTitle: string;
}) {
  return (
    <div className="mx-auto mb-8 max-w-screen-sm text-center lg:mb-16">
      <Header2>{headerTitle}</Header2>
      <Paragraph2>{children}</Paragraph2>
    </div>
  );
}
