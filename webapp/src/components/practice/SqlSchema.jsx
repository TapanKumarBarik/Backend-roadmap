import { useLoader } from '../../hooks/useLoader.js';
import { loadSchema } from '../../lib/practice/sqlRunner.js';
import { SQL } from '../../config/code.js';

/**
 * The tables a SQL problem runs on, beside its statement: each table's columns with their types, how many rows it has, and its first few rows. They are
 * read from the data itself by the SQL engine, so they are always what the query will really see.
 * @param {{ data: string }} props  the SQL that creates and fills the tables
 */
export default function SqlSchema({ data }) {
  const { data: schema, error } = useLoader(() => loadSchema(data), [data]);
  return (
    <section className="cp-panel sq-tables" aria-label={SQL.tables}>
      <h3>{SQL.tables}</h3>
      {!schema && !error && <p className="cp-note">{SQL.tablesLoading}</p>}
      {error && <p className="cp-note">{SQL.tablesFailed}</p>}
      {schema && schema.tables.map((table, i) => (
        <details key={table.name} className="sq-table-info" open={i === 0}>
          <summary>
            <strong>{table.name}</strong>
            <span>{SQL.rowCount(table.rows)}</span>
          </summary>
          <ul className="sq-columns">
            {table.columns.map((column) => (
              <li key={column.name}><code>{column.name}</code> <span>{column.type.toLowerCase()}{column.primary ? ' · key' : ''}</span></li>
            ))}
          </ul>
          {table.sample.length > 0 && (
            <div className="sq-scroll" tabIndex={0} role="region" aria-label={`${table.name}: ${SQL.firstRows}`}>
              <table className="sq-table">
                <thead><tr>{table.columns.map((column) => <th key={column.name} scope="col">{column.name}</th>)}</tr></thead>
                <tbody>
                  {table.sample.map((row, r) => (
                    <tr key={r}>{row.map((value, c) => <td key={c} className={value === null ? 'is-null' : typeof value === 'number' ? 'is-num' : undefined}>{value === null ? SQL.nothing : String(value)}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </details>
      ))}
      {schema && <p className="cp-note">{SQL.tablesNote}</p>}
    </section>
  );
}
