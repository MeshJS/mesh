import { frameworks, templates, languages } from './data';

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

      {/* <SelectSection
        title="Select a Stack"
        desc="The stack you want to build on."
        items={frameworks}
        selected={selectedFramework}
        setSelected={setSelectedFramework}
      /> */}

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
    <>
      <div className="text-center">
        <h2 className="mb-4 text-4xl tracking-tight font-extrabold text-gray-900 dark:text-white">
          {title}
        </h2>
        <p className="font-light text-gray-500 lg:mb-16 mb-4 sm:text-xl dark:text-gray-400">
          {desc}
        </p>
      </div>
      <div className="grid gap-8 mb-6 lg:mb-16 sm:grid-cols-2">
        {Object.keys(items).map((key, i) => {
          const item = items[key];
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
    </>
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
      flex flex-col items-center rounded-lg border shadow-md md:flex-row md:max-w-xl hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700 ${
        item.comingsoon == undefined && 'cursor-pointer'
      }
      `}
      onClick={() => {
        item.comingsoon == undefined &&
          setSelected(selected == item.cli ? undefined : item.cli);
      }}
    >
      <img
        className="hidden md:block object-cover rounded-t-lg md:h-auto md:w-48 md:rounded-none md:rounded-l-lg bg-white"
        src={`templates/${item.image}`}
        alt={item.title}
      />
      <div className="flex flex-col justify-between p-8 leading-normal">
        {item.comingsoon && (
          <span className="bg-blue-100 text-blue-800 text-xs font-semibold mr-2 px-2.5 py-0.5 rounded dark:bg-blue-200 dark:text-blue-800 max-w-fit">
            Coming soon
          </span>
        )}
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
