export * from './forge.script';

/*splitString(str): string[] {
  const size = 64;
  const words = str.split(' ');
  const output = [];
  let temp_string = '';

  for (let i = 0; i < words.length; i++) {
    if (`${temp_string} ${words[i]}`.length <= size) {
      temp_string += ` ${words[i]}`;
    } else if (temp_string.length > 0) {
      output.push(temp_string.trim());
      temp_string = words[i];
    }
  }

  if (temp_string.length <= size && temp_string.length > 0) {
    output.push(temp_string.trim());
  }

  // if its continuous string
  if (str.length > 0 && output.length === 0) {
    // str = temp_string;
    for (let i = 0; i < str.length; i++) {
      if ((temp_string + str[i]).length <= size) {
        temp_string += str[i];
      } else if (temp_string.length > 0) {
        output.push(temp_string.trim());
        temp_string = str[i];
      }
    }
    output.push(temp_string.trim());
  }

  return output;
}

maskMetadata(metadata): any {
  const maskedMetadata = {};
  for (const key in metadata) {
    if (metadata[key].constructor === Array) {
      maskedMetadata[key] = [];
      for (const i in metadata[key]) {
        maskedMetadata[key].push(
          new Array(metadata[key][i].length + 1).join('#'),
        );
      }
    } else if (
      typeof metadata[key] === 'string'
      || metadata[key] instanceof String
    ) {
      maskedMetadata[key] = new Array(metadata[key].length + 1).join('#');
    } else {
      maskedMetadata[key] = metadata[key];
    }
  }
  return maskedMetadata;
}*/
