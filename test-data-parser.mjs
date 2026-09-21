import assert from 'node:assert/strict';
import { LabelDataParser } from './scripts/data-parser.js';

const parser = new LabelDataParser(() => ['', '', '', '']);
const result = parser.parse([
  '20;200',
  'ABC;100',
  '100;1000',
  '3;30'
].join('\n'));

assert.deepStrictEqual(result.items.map(({ short, long }) => ({ short, long })), [
  { short: '3', long: '30' },
  { short: '20', long: '200' },
  { short: '100', long: '1000' }
]);
assert.equal(result.errors.length, 1);

console.log('test passed');
