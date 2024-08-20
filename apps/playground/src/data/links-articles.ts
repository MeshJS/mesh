import { NewspaperIcon } from "@heroicons/react/24/solid";

import { MenuItem } from "~/types/menu-item";

export const articleNew16 = {
  title: "What's new in Mesh 1.6",
  desc: "",
  link: "whats-new-in-16",
  thumbnail: "/articles/develop-first-web-app.png",
  image: "/articles/arches-1866598_1280.jpg",
};
export const articleMesh20 = {
  title: "Introduce Mesh 2.0",
  desc: "",
  link: "typescript-cardano-sdk",
  thumbnail: "/articles/develop-first-web-app.png",
  image: "/articles/arches-1866598_1280.jpg",
};
export const articleElementsOfCardano = {
  title: "Elements of Cardano",
  desc: "Cardano represents a significant advancement in blockchain technology, offering a scalable, secure, and flexible platform that is well-suited for a wide range of applications. Its unique combination of public, permissionless infrastructure, proof-of-stake consensus, and support for smart contracts and native assets makes it a powerful tool for developers and enterprises alike.",
  link: "elements-of-cardano",
  thumbnail: "/articles/spices-4185324_640.png",
  image: "/articles/spices-4185324_640.jpg",
};

export const linksArticles: MenuItem[] = [articleElementsOfCardano,articleMesh20, articleNew16];

export const metaArticles: MenuItem = {
  link: `/blogs`,
  title: "Blogs",
  desc: "Read the latest blogs and articles about Mesh",
  icon: NewspaperIcon,
  items: linksArticles,
};
