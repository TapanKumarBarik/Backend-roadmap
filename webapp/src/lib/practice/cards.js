// Flash cards for a set of interview questions: the question on the front, the model answer on the back. This is what the Practice list, the interview set page
// and the API need (which sets suit cards, and the cards of one). How a deck is played is lib/practice/deck.js, which only the deck screen loads.

/** The cards of a set of questions `[{ q, a }]`: a key (the question's place in the set), the front and the back. */
export const cardsOf = (questions) => questions.map((question, i) => ({ key: String(i), front: question.q, back: question.a }));

/** Whether a set reads well as cards: it has questions, and every answer is short enough to sit on the back of one (a worked solution with code is not). */
export const suitsCards = (questions, maxAnswerChars) => questions.length > 0 && questions.every((question) => typeof question.a === 'string' && question.a.length <= maxAnswerChars);

