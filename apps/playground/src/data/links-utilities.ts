import {
  ArrowRightIcon,
  ArrowTurnRightDownIcon,
  ArrowTurnRightUpIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/solid";

import { MenuItem } from "~/types/menu-item";

export const metaResolvers = {
  title: "Resolvers",
  desc: "Converts between different formats.",
  link: "/apis/utilities/resolvers",
  icon: ArrowRightIcon,
};

export const metaSerializers = {
  title: "Serializers",
  desc: "Encode objects into CBOR or bech32 format.",
  link: "/apis/utilities/serializers",
  icon: ArrowTurnRightDownIcon,
};

export const metaDeserializers = {
  title: "Deserializers",
  desc: "Parse CBOR or bech32 into objects.",
  link: "/apis/utilities/deserializers",
  icon: ArrowTurnRightUpIcon,
};

export const linksUtilities: MenuItem[] = [
  metaSerializers,
  metaDeserializers,
  metaResolvers,
];

export const metaUtilities = {
  title: "Utilities",
  desc: "Useful functions that you need while building applications.",
  link: "/apis/utilities",
  icon: WrenchScrewdriverIcon,
  items: linksUtilities,
};
