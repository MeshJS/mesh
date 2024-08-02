export default function InputTable({
  listInputs,
}: {
  listInputs: React.ReactNode[];
}) {
  return (
    <div className="relative overflow-x-auto">
      <table className="m-0 w-full text-left text-sm text-gray-500 dark:text-gray-400">
        <tbody>
          {listInputs.map((input, i) => {
            return (
              <tr key={i} className="border-none bg-white dark:bg-gray-800">
                <td>{input}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
