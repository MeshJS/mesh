import SvgDiscord from "~/components/svgs/discord";
import SvgGithub from "~/components/svgs/github";
import SvgTwitter from "~/components/svgs/twitter";

export const linkDiscord = {
  icon: SvgDiscord,
  link: "/go/discord",
  redirect: "https://discord.gg/WvnCNqmAxy",
};
export const linkGithub = {
  icon: SvgGithub,
  link: "/go/github",
  redirect: "https://github.com/MeshJS/mesh",
};
export const linkTwitter = {
  icon: SvgTwitter,
  link: "/go/twitter",
  redirect: "https://twitter.com/meshsdk",
};

export const socials = [linkDiscord, linkTwitter, linkGithub];
