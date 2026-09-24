import type { IndexQuote } from '../types/indices';
import { indexNumber } from '../utils/indices';
import { IndexChange } from './IndexChange';

export function IndexReferenceCloses({ quote }: { quote: IndexQuote }) {
  if (!quote.references?.length) return null;
  return <section className="index-reference-closes" aria-label="Historical reference values">
    <h3>Reference closes</h3>
    <table><thead><tr><th>Period / date</th><th>Index value</th><th>Change since</th></tr></thead>
      <tbody>{quote.references.map(reference => <tr key={reference.label}>
        <td>{reference.label}<small>{new Intl.DateTimeFormat('en-IN', {day:'2-digit',month:'short',year:'numeric'}).format(new Date(`${reference.date}T12:00:00+05:30`))}</small></td>
        <td>{indexNumber(reference.value)}</td>
        <td><IndexChange value={quote.last === null || reference.value <= 0 ? null : (quote.last / reference.value - 1) * 100} percent badge /></td>
      </tr>)}</tbody>
    </table>
    <small>Compared with the last reported value above. Dates follow the exchange’s reference sessions.</small>
  </section>;
}
