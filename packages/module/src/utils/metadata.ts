import { IPFS_PROVIDER } from '../global';

export const convertMetadataPropToString = (src: any) => {
  if (typeof src === 'string') return src;
  else if (Array.isArray(src)) return src.join('');
  return null;
};

export const linkToSrc = (link: any, base64 = false) => {
  const base64regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
  if (link.startsWith('https://')) return link;
  else if (link.startsWith('ipfs://'))
    return `${IPFS_PROVIDER}${
      link
        .split('ipfs://')[1]
        .split('ipfs/')
        .slice(-1)[0]
    }`;
  // IPFS_PROVIDER +
  // '/' +
  // link.split('ipfs://')[1].split('ipfs/').slice(-1)[0]
  else if (
    (link.startsWith('Qm') && link.length === 46) ||
    (link.startsWith('baf') && link.length === 59)
  ) {
    // return IPFS_PROVIDER + '/' + link;
    return `${IPFS_PROVIDER}${link}`;
  } else if (base64 && base64regex.test(link))
    return 'data:image/png;base64,' + link;
  else if (link.startsWith('data:image')) return link;
  return null;
};
