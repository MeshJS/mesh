export function CardAsset({ asset, selectedAssets, toggleSelectedAssets }) {
  let thisClass =
    asset.unit in selectedAssets
      ? "max-w-sm bg-white rounded-lg border border-green-200 shadow-md dark:bg-gray-800 dark:border-green-700 cursor-pointer"
      : "max-w-sm bg-white rounded-lg border border-gray-200 shadow-md dark:bg-gray-800 dark:border-gray-700 cursor-pointer";
  return (
    <div
      className={thisClass}
      onClick={() => {
        toggleSelectedAssets && toggleSelectedAssets(asset);
      }}
    >
      <div className="aspect-w-3 aspect-h-2 rounded-t-lg overflow-hidden">
        {asset.image && (
          <img
            className="m-0 w-full h-full object-center object-cover"
            src={asset.image}
            alt={asset.name}
          />
        )}
      </div>
      <div className="p-5 overflow-hidden tracking-tight">
        <b>{asset.name}</b>
      </div>
    </div>
  );
}
