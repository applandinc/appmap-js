import { splitCamelized } from '../lib/splitCamelized';

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'code',
  'for',
  'from',
  'has',
  'he',
  'in',
  'is',
  'it',
  'its',
  'of',
  'on',
  'over',
  'that',
  'the',
  'to',
  'was',
  'were',
  'will',
  'with',
  'without',
]);

/**
 * Replace non-alphanumeric characters with spaces, then split the keyword on spaces.
 * So in effect, words with non-alphanumeric characters become multiple words.
 * Allow dash and underscore as delimeters.
 */
const sanitizeKeyword = (keyword: string): string[] =>
  keyword.replace(/[^\p{L}\p{N}\-_]/gu, ' ').split(' ');

/**
 * Remove duplicate entries from a sorted array.
 */
const uniq = (ary: string[]) => {
  if (ary.length === 0) {
    return [];
  }
  console.warn(`before, ary: ${JSON.stringify(ary)}`);
  let i = 0;
  for (let j = 1; j < ary.length; j++) {
    if (ary[j] !== ary[i]) {
      i++;
      ary[i] = ary[j];
    }
  }
  console.warn(`after, ary: ${JSON.stringify(ary)}`);

  return ary.slice(0, i + 1);
};

/**
 * Extract keywords from a string or an array of strings. The extraction process includes the following steps:
 *
 * - Remove non-alphanumeric characters and split the keyword on spaces.
 * - Split camelized words.
 * - Remove stop words.
 */
export default function queryKeywords(words: undefined | string | string[]): string[] {
  if (!words) return [];

  const wordsArray = Array.isArray(words) ? words : [words];
  if (wordsArray.length === 0) return [];

  return wordsArray
    .map((word) => sanitizeKeyword(word || ''))
    .flat()
    .filter(Boolean)
    .map((word): string[] => {
      const camelized = splitCamelized(word)
        .split(/[\s\-_]/)
        .map((word) => word.toLowerCase());
      // Return each of the component words, and also return each pair of adjacent words as a single word.
      const result = new Array<string>();
      for (let i = 0; i < camelized.length; i++) {
        result.push(camelized[i]);
        if (i > 0) result.push([camelized[i - 1] + camelized[i]].join(''));
      }
      return result;
    })
    .flat()
    .map((str) => str.trim())
    .filter(Boolean)
    .filter((str) => str.length >= 2)
    .filter((str) => !STOP_WORDS.has(str));
}

export function queryUniqKeywords(words: undefined | string | string[]): string[] {
  const ret = queryKeywords(words).sort();
  return uniq(ret);
}
