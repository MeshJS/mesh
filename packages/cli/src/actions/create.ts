import prompts from 'prompts';

export const create = async (name, options) => {
  const template = options.template ?? await select(
    'What template do you want to use?', [
      { title: "Starter Project", value: "starter" },
      { title: "Multi-Sig Minting", value: "minting" },
      { title: "Smart-Contract Marketplace", value: "marketplace" },
    ]
  );

  const framework = options.framework ?? await select(
    'What framework do you want to use?', [
      { title: "Next.js", value: "next" },
      { title: "Gatsby", value: "gatsby" },
    ]
  );
  
  const language = options.language ?? await select(
    'What language do you want to use?', [
      { title: "JavaScript", value: "javascript" },
      { title: "TypeScript", value: "typescript" },
    ]
  );

  console.log({name, template, framework, language});
};

const select = async (question, choices) => {
  const response = await prompts({
    type: 'select',
    message: question,
    name: 'selection',
    choices,
  });

  return response.selection;
};
