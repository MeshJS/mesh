export default function Image({
  src,
  caption,
}: {
  src: string;
  caption?: string;
}) {
  return (
    <figure className="max-w-lg">
      <img
        className="h-auto max-w-xl rounded-lg shadow-xl dark:shadow-gray-800"
        src={src}
      />
      {caption && (
        <figcaption className="mt-2 text-sm text-center text-gray-500 dark:text-gray-400">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
