// The reading options on a lesson: how big the text is and how wide the column. They are kept in this browser (STORAGE.readingPrefs)
// and applied as data attributes on <html> (styles/global.css), so they hold on every lesson and after a reload.

export const READING = {
  button: 'Reading options',
  title: 'Reading',
  reset: 'Back to default',
  defaults: { size: 'm', width: 'm' },
  groups: [
    { key: 'size', label: 'Text size', options: [['s', 'Small'], ['m', 'Default'], ['l', 'Large']] },
    { key: 'width', label: 'Line width', options: [['n', 'Narrow'], ['m', 'Default'], ['w', 'Wide']] }
  ]
};
