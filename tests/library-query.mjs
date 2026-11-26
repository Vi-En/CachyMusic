import assert from 'node:assert/strict';
import { queryLibrary } from '../scripts/modules/library-query.js';

const tracks = [
    { index: 0, title: 'Zebra', duration: 120, genre: 'jazz fusion', search: 'zebra atlas', format: 'flac', bitDepth: 24 },
    { index: 1, title: 'Atlas', duration: 120, genre: 'jazz', search: 'atlas trio', extension: 'mp3', inCurrentPlaylist: true },
    { index: 2, title: 'Brass', duration: 180, genre: 'jazz fusion', search: 'brass collective', extension: 'dsf', inCurrentPlaylist: true }
];

function query(options = {}) {
    return queryLibrary(tracks, { query: '', sort: 'default', ...options });
}

assert.deepEqual(query(), [0, 1, 2]);
assert.deepEqual(query({ query: '  TRIO  Atlas ' }), [1]);
assert.deepEqual(query({ query: 'genre:fusion jazz', playlist: true }), [2]);
assert.deepEqual(query({ formatFilter: 'hires' }), [0, 2]);
assert.deepEqual(query({ formatFilter: 'lossless' }), [0, 2]);
assert.deepEqual(query({ formatFilter: 'lossy' }), [1]);
assert.deepEqual(query({ sort: 'duration-desc' }), [2, 1, 0]);
assert.deepEqual(query({ sort: 'title-asc' }), [1, 2, 0]);
assert.deepEqual(query(), [0, 1, 2]);
console.log('Library search, filters, and sorting passed.');
