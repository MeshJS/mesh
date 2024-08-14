import { useTheme } from 'next-themes';
import Image from 'next/image';

export function Logo(props: React.ComponentPropsWithoutRef<'svg'>) {
  let { theme } = useTheme();
  return (
    <div className="flex items-center gap-2">
      <Image
        src={
          theme == 'light'
            ? 'https://meshjs.dev/logos/black/logo-mesh-black-32x32.png'
            : 'https://meshjs.dev/logos/white/logo-mesh-white-32x32.png'
        }
        alt="Mesh SDK Docs"
        width={32}
        height={32}
      />
      Mesh SDK Docs
    </div>
  );
}
