// The questions of the subnetting drills: made from a seed, so the same seed is the same round for everyone (the puzzle of the day), checked in the
// browser (no server, nothing to hide), and each with the working written out, the way it is taught. Pure: the random numbers come from the seed.
import { parseIp, formatIp, maskOf, prefixOfMask, describe, contains, overlaps, prefixForHosts } from './cidr.js';

/** A 32-bit hash of a string (FNV-1a), the start of a seed. */
function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** A function that returns the same numbers in [0, 1) every time for the same seed text (mulberry32). */
export function rng(seed) {
  let a = hash(String(seed));
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The seed of today's puzzle: the date in UTC, so everyone in the world gets the same one on the same day. */
export const dailySeed = (date = new Date()) => `daily-${date.toISOString().slice(0, 10)}`;

const int = (random, min, max) => min + Math.floor(random() * (max - min + 1));
const pick = (random, list) => list[Math.floor(random() * list.length)];

// What each level asks: the prefix lengths it uses, and the kinds of question it may ask.
export const LEVELS = [
  { level: 1, name: 'Whole octets', prefixes: [8, 16, 24], kinds: ['network', 'broadcast', 'hosts', 'mask'] },
  { level: 2, name: 'Small subnets', prefixes: [25, 26, 27, 28, 29, 30], kinds: ['network', 'broadcast', 'hosts', 'mask', 'first', 'last', 'inside'] },
  { level: 3, name: 'Across octets', prefixes: [17, 18, 19, 20, 21, 22, 23], kinds: ['network', 'broadcast', 'hosts', 'first', 'last', 'inside', 'size'] },
  { level: 4, name: 'Anything', prefixes: [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30], kinds: ['network', 'broadcast', 'hosts', 'mask', 'first', 'last', 'inside', 'size', 'overlap'] }
];

function randomAddress(random) {
  const family = pick(random, ['10', '172', '192']);
  const octet = () => int(random, 0, 255);
  if (family === '10') return parseIp(`10.${octet()}.${octet()}.${octet()}`);
  if (family === '172') return parseIp(`172.${int(random, 16, 31)}.${octet()}.${octet()}`);
  return parseIp(`192.168.${octet()}.${octet()}`);
}

/**
 * The octet the block boundary falls inside (0 to 3) and the size of a block in that octet, for a prefix that does not end on an octet boundary;
 * null for a prefix that does. "Block size = 256 minus the mask's octet" is the shortcut the explanations use.
 */
export function boundaryOctet(prefix) {
  if (prefix % 8 === 0) return null;
  return { index: Math.floor(prefix / 8), size: 2 ** (8 - (prefix % 8)) };
}

const octets = (ip) => formatIp(ip).split('.').map(Number);
const text = (block) => `${formatIp(block.ip)}/${block.prefix}`;

// Each kind returns { prompt, answer, explain }, where `answer` is the text a person would type.
const KINDS = {
  network(random, prefixes) {
    const prefix = pick(random, prefixes);
    const ip = randomAddress(random);
    const d = describe(ip, prefix);
    return { prompt: `What is the network address of ${text(d)}?`, answer: d.text.network, explain: networkSteps(d) };
  },
  broadcast(random, prefixes) {
    const prefix = pick(random, prefixes);
    const d = describe(randomAddress(random), prefix);
    return {
      prompt: `What is the broadcast address of ${text(d)}?`,
      answer: d.text.broadcast,
      explain: [...networkSteps(d), `The broadcast address is the last address of the block, where every host bit is 1: ${d.text.broadcast}.`]
    };
  },
  first(random, prefixes) {
    const d = describe(randomAddress(random), pick(random, prefixes));
    return { prompt: `What is the first usable host address in ${text(d)}?`, answer: d.text.first, explain: [...networkSteps(d), `The first host is one after the network address: ${d.text.first}.`] };
  },
  last(random, prefixes) {
    const d = describe(randomAddress(random), pick(random, prefixes));
    return { prompt: `What is the last usable host address in ${text(d)}?`, answer: d.text.last, explain: [`The block is ${d.text.network} to ${d.text.broadcast}.`, `The last host is one before the broadcast address: ${d.text.last}.`] };
  },
  hosts(random, prefixes) {
    const d = describe(randomAddress(random), pick(random, prefixes));
    return {
      prompt: `How many usable hosts are in ${text(d)}?`,
      answer: String(d.usable),
      explain: [`There are 32 - ${d.prefix} = ${32 - d.prefix} host bits, so 2^${32 - d.prefix} = ${d.total.toLocaleString('en-US')} addresses.`, `Two are taken, the network address and the broadcast address: ${d.total.toLocaleString('en-US')} - 2 = ${d.usable.toLocaleString('en-US')}.`]
    };
  },
  mask(random, prefixes) {
    const prefix = pick(random, prefixes);
    const toPrefix = random() < 0.5;
    const mask = formatIp(maskOf(prefix));
    return toPrefix
      ? { prompt: `What prefix length is the mask ${mask}?`, answer: String(prefix), explain: [`Count the one-bits in ${mask}: ${prefix}.`, `So the prefix is /${prefix}.`] }
      : { prompt: `What is the mask for a /${prefix}?`, answer: mask, explain: [`A /${prefix} has ${prefix} one-bits and ${32 - prefix} zero-bits.`, `As four octets: ${mask}.`] };
  },
  inside(random, prefixes) {
    const block = describe(randomAddress(random), pick(random, prefixes));
    const near = random() < 0.5; // half the time the address is just outside the block, which is the hard case
    const candidate = near
      ? (random() < 0.5 ? block.broadcast + int(random, 1, 3) : block.network - int(random, 1, 3))
      : block.network + int(random, 0, block.total - 1);
    const ip = Math.max(0, Math.min(0xffffffff, candidate)) >>> 0;
    const yes = contains(block, ip);
    return {
      prompt: `Is ${formatIp(ip)} inside ${text(block)}?`,
      answer: yes ? 'yes' : 'no',
      explain: [`The block runs from ${block.text.network} to ${block.text.broadcast}.`, yes ? `${formatIp(ip)} is between them, so yes.` : `${formatIp(ip)} is outside that range, so no.`]
    };
  },
  size(random, prefixes) {
    const prefix = pick(random, prefixes.filter((p) => p >= 17 && p <= 28).length ? prefixes.filter((p) => p >= 17 && p <= 28) : [24]);
    const wanted = int(random, 2, Math.max(2, describe(0, prefix).usable));
    const answer = prefixForHosts(wanted);
    const block = describe(0, answer);
    return {
      prompt: `What is the longest prefix (smallest subnet) that can hold ${wanted.toLocaleString('en-US')} hosts?`,
      answer: String(answer),
      explain: [`A /${answer} has ${block.usable.toLocaleString('en-US')} usable hosts, enough for ${wanted.toLocaleString('en-US')}.`, answer < 30 ? `A /${answer + 1} has only ${describe(0, answer + 1).usable.toLocaleString('en-US')}, which is too few.` : 'A /30 is the smallest block with two usable hosts.', `So the answer is /${answer}.`]
    };
  },
  overlap(random, prefixes) {
    const a = describe(randomAddress(random), pick(random, prefixes));
    // Half the time the second block is inside or around the first, half the time it is the neighbour: that is how two networks really clash.
    const prefixB = Math.max(9, Math.min(30, a.prefix + int(random, -4, 4)));
    const start = random() < 0.5 ? a.network : a.network + (random() < 0.5 ? 1 : -1) * 2 ** (32 - prefixB);
    const b = describe(Math.max(0, Math.min(0xffffffff, start)) >>> 0, prefixB);
    const yes = overlaps({ ip: a.network, prefix: a.prefix }, { ip: b.network, prefix: b.prefix });
    return {
      prompt: `Do ${text(a)} and ${text(b)} overlap?`,
      answer: yes ? 'yes' : 'no',
      explain: [`${text(a)} runs from ${a.text.network} to ${a.text.broadcast}.`, `${text(b)} runs from ${b.text.network} to ${b.text.broadcast}.`, yes ? 'The ranges share addresses, so they overlap: two networks like this cannot be peered or routed between.' : 'The ranges do not touch, so they do not overlap.']
    };
  }
};

/** The steps that find a block's network address (`d` is what describe() returns), in the block-size way for a prefix that falls inside an octet and in one line for one that does not. */
export function networkSteps(d) {
  const boundary = boundaryOctet(d.prefix);
  const mask = d.text.mask;
  if (!boundary) {
    const kept = d.prefix / 8;
    return [`${text(d)}: the mask is ${mask}, so the first ${kept} octet${kept === 1 ? '' : 's'} are the network and the rest are for hosts.`, `Keep those and zero the rest: the network address is ${d.text.network}.`];
  }
  const value = octets(d.ip)[boundary.index];
  const net = octets(d.network)[boundary.index];
  return [
    `${text(d)}: the mask is ${mask}. The boundary falls in octet ${boundary.index + 1}, where the block size is 256 - ${octets(d.mask)[boundary.index]} = ${boundary.size}.`,
    `Octet ${boundary.index + 1} of the address is ${value}. The largest multiple of ${boundary.size} that is not more than ${value} is ${net}.`,
    `Octets before it stay, octets after it become 0: the network address is ${d.text.network}.`
  ];
}

/** One question. `random` is a function like rng(seed). The result has `kind`, `level`, `prompt`, `answer` (the text that is right) and `explain` (the steps). */
export function makeQuestion(level, random) {
  const spec = LEVELS.find((l) => l.level === level) || LEVELS[0];
  const kind = pick(random, spec.kinds);
  return { kind, level: spec.level, ...KINDS[kind](random, spec.prefixes) };
}

/** A round of `count` questions from a seed: the same seed and level always give the same round. */
export function round(seed, level = 1, count = 10) {
  const random = rng(`${seed}|${level}`);
  return Array.from({ length: count }, (_, i) => ({ number: i + 1, ...makeQuestion(level, random) }));
}

/** The puzzle of the day: ten questions that climb from easy to hard, the same for everyone on a given seed (see dailySeed). */
export function dailyRound(seed, mix = [[1, 3], [2, 3], [3, 2], [4, 2]]) {
  const questions = mix.flatMap(([level, count]) => round(seed, level, count));
  return questions.map((q, i) => ({ ...q, number: i + 1 }));
}

/** Whether what was typed is the answer. Forgiving about spaces, a leading slash, "yes"/"y", commas in numbers and the form of an address. */
export function check(question, given) {
  const typed = String(given ?? '').trim().toLowerCase();
  if (!typed) return false;
  const answer = question.answer;
  if (answer === 'yes' || answer === 'no') {
    const said = ['y', 'yes', 'true'].includes(typed) ? 'yes' : ['n', 'no', 'false'].includes(typed) ? 'no' : null;
    return said === answer;
  }
  if (parseIp(answer) !== null) return parseIp(typed) === parseIp(answer);
  const number = typed.replace(/^\//, '').replace(/[,\s]/g, '');
  if (question.kind === 'mask' && parseIp(typed) !== null) return String(prefixOfMask(typed)) === answer;
  return number === answer;
}
