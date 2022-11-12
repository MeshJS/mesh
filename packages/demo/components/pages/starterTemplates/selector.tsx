const templates = [
  {
    title: 'Starter',
    desc: 'A starter project with CardanoWallet dropdown button.',
    cli: 'starter',
    image: 'starter.png',
  },
  {
    title: 'Minting',
    desc: 'Create multi-sig transactions for minting tokens.',
    cli: 'minting',
    image: 'minting.png',
  },
  // {
  //   title: 'Marketplace',
  //   desc: 'marketplace allows anyone to buy and sell native assets such as NFTs.',
  //   cli: 'marketplace'
  // }
];

const frameworks = [
  {
    title: 'Next.js',
    desc: 'Web development framework by Vercel enabling React-based web applications with server-side rendering.',
    cli: 'next',
    url: 'https://nextjs.org/',
    image: 'nextjs.png',
  },
  {
    title: 'Gatsby',
    desc: 'Static site generator built on top of Node.js using React and GraphQL.',
    cli: 'gatsby',
    url: 'https://www.gatsbyjs.com/',
    image: 'gatsby.png',
  },
];

const languages = [
  {
    title: 'JavaScript',
    desc: 'Programming language that allows you to implement complex features on web pages.',
    cli: 'javascript',
    image: 'javascript.png',
  },
  {
    title: 'TypeScript',
    desc: 'Syntactical superset of JavaScript that adds optional static typing.',
    cli: 'typescript',
    image: 'typescript.svg',
  },
];

const repos = [
  {
    template: 'starter',
    framework: 'next',
    language: 'typescript',
  },
  {
    template: 'starter',
    framework: 'next',
    language: 'javascript',
  },
];

export default function Selector({
  selectedTemplate,
  setSelectedTemplate,
  selectedFramework,
  setSelectedFramework,
  selectedLanguage,
  setSelectedLanguage,
}) {
  return (
    <div>
      <SelectSection
        title="Select a Template"
        desc="Explore and choose from a collection of open-source templates."
        items={templates}
        selected={selectedTemplate}
        setSelected={setSelectedTemplate}
      />

      <SelectSection
        title="Select a Framework"
        desc="Framework you want to build on."
        items={frameworks}
        selected={selectedFramework}
        setSelected={setSelectedFramework}
      />

      <SelectSection
        title="Select a Language"
        desc="Programming language for your project."
        items={languages}
        selected={selectedLanguage}
        setSelected={setSelectedLanguage}
      />
    </div>
  );
}

function SelectSection({ title, desc, items, selected, setSelected }) {
  return (
    <section className="bg-white dark:bg-gray-900">
      <div className="px-4 mx-auto max-w-screen-xl lg:px-6">
        <div className="mx-auto max-w-screen-sm text-center mb-8 lg:mb-16">
          <h2 className="mb-4 text-4xl tracking-tight font-extrabold text-gray-900 dark:text-white">
            {title}
          </h2>
          <p className="font-light text-gray-500 lg:mb-16 sm:text-xl dark:text-gray-400">
            {desc}
          </p>
        </div>
        <div className="grid gap-8 mb-6 lg:mb-16 md:grid-cols-2">
          {items.map((item, i) => {
            return (
              <SelectCard
                item={item}
                selected={selected}
                setSelected={setSelected}
                key={i}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}

function SelectCard({ item, selected, setSelected }) {
  return (
    <div
      className={`
      ${
        selected == item.cli
          ? 'border-green-400 border-2 '
          : 'dark:border-gray-700 '
      }
      flex flex-col items-center rounded-lg border shadow-md md:flex-row md:max-w-xl hover:bg-gray-100 bg-white dark:bg-gray-800 dark:hover:bg-gray-700 cursor-pointer`}
      onClick={() => {
        setSelected(selected == item.cli ? undefined : item.cli);
      }}
    >
      <img
        className="object-cover w-full rounded-t-lg md:h-auto md:w-48 md:rounded-none md:rounded-l-lg bg-white"
        src={`templates/${item.image}`}
        alt={item.title}
      />
      <div className="flex flex-col justify-between p-8 leading-normal">
        <h5 className="mb-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
          {item.title}
        </h5>
        <p className="mb-3 font-normal text-gray-700 dark:text-gray-400">
          {item.desc}
        </p>
      </div>
    </div>
  );
}
