import { cx } from '../../lib/cx.js';

/**
 * One multiple-choice question as the drill draws it: the text, the options as radio buttons or checkboxes, and, once it has been checked, the right answers
 * marked and the reader's wrong ones too. `chosen` is the option ids picked; `result` is { answer, correct } after a check (or null); `onToggle(optionId)` picks one.
 * @param {{ question: { key: string, text: string, choose: string, options: { id: string, text: string }[] }, chosen: string[], onToggle: (id: string) => void, result?: { answer: string[] } | null, disabled?: boolean, selectAll: string, rightAnswer: string }} props
 */
export default function QuestionFieldset({ question, chosen, onToggle, result = null, disabled = false, selectAll, rightAnswer }) {
  return (
    <fieldset className="dr-question" disabled={disabled || !!result}>
      <legend>{question.text}{question.choose === 'any' && !/select all/i.test(question.text) && <em> {selectAll}</em>}</legend>
      {question.options.map((option) => (
        <label key={option.id} className={cx('pr-option', result && result.answer.includes(option.id) && 'is-answer', result && chosen.includes(option.id) && !result.answer.includes(option.id) && 'is-miss')}>
          <input type={question.choose === 'any' ? 'checkbox' : 'radio'} name={question.key} checked={chosen.includes(option.id)} onChange={() => onToggle(option.id)} />
          <span>{option.text}</span>
          {result && result.answer.includes(option.id) && <span className="pr-mark">{rightAnswer}</span>}
        </label>
      ))}
    </fieldset>
  );
}
