import { NewspaperIcon } from "@heroicons/react/24/solid";

import { MenuItem } from "~/types/menu-item";

export const blogNew16 = {
  title: "What's new in Mesh 1.6",
  desc: "",
  link: "whats-new-in-16",
  thumbnail: "/guides/develop-first-web-app.png",
  image: "/guides/arches-1866598_1280.jpg",
};
export const blogMesh20 = {
  title: "Introduce Mesh 2.0",
  desc: "",
  link: "typescript-cardano-sdk",
  thumbnail: "/guides/develop-first-web-app.png",
  image: "/guides/arches-1866598_1280.jpg",
};

export const linksBlogs: MenuItem[] = [blogMesh20, blogNew16];

export const metaBlogs: MenuItem = {
  link: `/blogs`,
  title: "Blogs",
  desc: "Read the latest blogs and articles about Mesh",
  icon: NewspaperIcon,
  items: linksBlogs,
};
