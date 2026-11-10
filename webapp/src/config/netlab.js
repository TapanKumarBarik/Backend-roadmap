// The words the subnet page draws with script (webapp/src/tools/subnet.js). The words that are on the page before any script runs, which a search
// engine reads, are in webapp/tools/subnet/index.html.
export const NETLAB = {
  invalid: 'That is not a block. Write an address and a prefix, like 192.168.1.130/26 (four numbers from 0 to 255, a slash, then 0 to 32).',
  rows: {
    network: 'Network address',
    broadcast: 'Broadcast address',
    first: 'First usable host',
    last: 'Last usable host',
    usable: 'Usable hosts',
    total: 'Total addresses',
    mask: 'Subnet mask',
    wildcard: 'Wildcard mask',
    prefix: 'Prefix length',
    kind: 'Range'
  },
  private: (range) => `Private (${range})`,
  public: 'Public',
  binaryLabel: 'The address in binary: the network bits are bold, the host bits are light',
  stepsHeading: 'Show the working',
  splitLabel: 'Split it into subnets of size',
  splitMore: (n) => `and ${n.toLocaleString('en-US')} more`,
  splitCount: (n, prefix) => `${n.toLocaleString('en-US')} subnets of /${prefix}`,

  levels: ['Whole octets', 'Small subnets', 'Across octets', 'Anything'],
  startRound: 'Start a round',
  startDaily: 'Play today’s puzzle',
  question: (n, total) => `Question ${n} of ${total}`,
  check: 'Check',
  next: 'Next question',
  finish: 'See the result',
  right: 'Correct.',
  wrong: (answer) => `Not quite. The answer is ${answer}.`,
  result: (score, total) => `${score} of ${total}`,
  dailyDone: (score, total) => `You have played today’s puzzle: ${score} of ${total}. A better score replaces it; the streak stays.`,
  streak: (n) => (n === 1 ? 'Streak: 1 day' : `Streak: ${n} days`),
  best: (n) => `Best: ${n}`,
  noStreak: 'Play today’s puzzle to start a streak.',
  share: 'Copy my result',
  shared: 'Copied. Paste it anywhere.',
  shareFailed: 'Could not copy. Select the text and copy it.',
  again: 'Play again',
  harder: 'Try the next level'
};
