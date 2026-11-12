import { SQL, SQL_RUNNER } from '../../config/code.js';

/**
 * The table a SQL query returned, as the learner sees it: the first rows (NULL in its own style, numbers to the right), and how many there were in all.
 * @param {{ table: { columns: string[], rows: any[][], truncated?: boolean } }} props
 */
export default function ResultTable({ table }) {
  const shown = table.rows.slice(0, SQL_RUNNER.shownRows);
  return (
    <div className="sq-result">
      <h4 className="cp-sub">{SQL.yourResult}</h4>
      {table.rows.length === 0 ? <p className="cp-note">{SQL.noRows}</p> : (
        <div className="sq-scroll" tabIndex={0} role="region" aria-label={SQL.yourResult}>
          <table className="sq-table">
            <thead>
              <tr>{table.columns.map((column, i) => <th key={i} scope="col">{column}</th>)}</tr>
            </thead>
            <tbody>
              {shown.map((row, r) => (
                <tr key={r}>
                  {row.map((value, c) => (
                    <td key={c} className={value === null ? 'is-null' : typeof value === 'number' ? 'is-num' : undefined}>{value === null ? SQL.nothing : String(value)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {table.rows.length > shown.length && <p className="cp-note">{SQL.shownRows(shown.length, table.rows.length)}</p>}
    </div>
  );
}
