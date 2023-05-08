export const resolveMedia = (
  src: String,
  ipfsUrl = 'https://infura-ipfs.io/ipfs/'
) => {
  // if its an array of strings = base64
  if (Array.isArray(src)) {
    src = src.join('');
  }

  // const base64regex =
  //   /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;

  if (src.startsWith('data:image')) {
    return src;
  }
  // this is commented because dont want to handle mediaType
  // else if (src.includes(';base64,' && base64regex.test(src))) {
  //   if (mediaType) {
  //     return 'data:' + mediaType + ';base64,' + src;
  //   } else {
  //     return 'data:image/png;base64,' + src;
  //   }
  // }
  else if (src.startsWith('ipfs://'))
    return ipfsUrl + src.split('ipfs://')[1].split('ipfs/').slice(-1)[0];
  else if (
    (src.startsWith('Qm') && src.length === 46) ||
    (src.startsWith('baf') && src.length === 59)
  ) {
    return ipfsUrl + src;
  }

  return src;
};
