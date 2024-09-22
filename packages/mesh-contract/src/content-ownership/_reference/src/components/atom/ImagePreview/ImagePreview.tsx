import Image from "next/image";
import React from "react";
import cross from "./cross.png";

function ImagePreview({
  url,
  removeCallBack,
}: {
  url: string;
  removeCallBack: VoidFunction;
}) {
  return (
    <div>
      <div className="relative">
        <Image
          src={url}
          alt="Image Preview"
          width={100}
          height={100}
          className="w-full object-contain rounded-2xl"
        />
        <div className=" absolute top-0 right-2 ">
          <button className="mt-2" onClick={removeCallBack}>
            <Image src={cross} alt="crossButtonImage" height={20} width={20} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default ImagePreview;
