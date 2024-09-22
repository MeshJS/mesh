import Image from "next/image";
import React from "react";
import logo from "./logo.jpeg";

// interface IconProps {
//     name: string;
//     alt: string;
//     className?: string;
//     width:number;
//     height:number;

//   }

const Icon: React.FC = () => {
  return <Image className=" object-contain cursor-pointer" src={logo} alt="logo" height={50} width={50} />;
};

export default Icon;
