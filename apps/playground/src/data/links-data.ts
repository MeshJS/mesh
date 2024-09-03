import {
  Bars2Icon,
  Bars3Icon,
  Bars4Icon,
  CircleStackIcon,
  WrenchIcon,
} from "@heroicons/react/24/solid";

import { MenuItem } from "~/types/menu-item";

export const metaOverview = {
  title: "Cardano Data Overview",
  desc: "Learn about the basics, and how Mesh handles Cardano data",
  link: "/apis/data/overview",
  icon: CircleStackIcon,
};

export const metaDataMesh = {
  title: "Mesh Data",
  desc: "Parse and manipulate Cardano data with Mesh Data type",
  link: "/apis/data/mesh",
  icon: Bars2Icon,
};
export const metaDataJson = {
  title: "JSON Data",
  desc: "Parse and manipulate Cardano data with JSON",
  link: "/apis/data/json",
  icon: Bars3Icon,
};
export const metaDataValue = {
  title: "Value",
  desc: "Manipulate Cardano Value Easily",
  link: "/apis/data/value",
  icon: Bars3Icon,
};
export const metaDataCbor = {
  title: "CBOR Data",
  desc: "Parse and manipulate Cardano data with CBOR",
  link: "/apis/data/cbor",
  icon: Bars4Icon,
};
export const metaDataUtils = {
  title: "Advance Utility for Data",
  desc: "Making data manipulation easier with Mesh",
  link: "/apis/data/utils",
  icon: WrenchIcon,
};

export const linksData: MenuItem[] = [
  metaOverview,
  metaDataMesh,
  metaDataJson,
  metaDataValue,
  // metaDataCbor, // todo
  // metaDataUtils, // todo
];

export const metaData = {
  title: "Data",
  desc: "Parse and manipulate data",
  link: "/apis/data",
  icon: CircleStackIcon,
  items: linksData,
};
