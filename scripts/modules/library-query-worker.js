import { queryLibrary } from './library-query.js';

self.onmessage = ({ data: { id, records, options } }) => {
    self.postMessage({ id, indices: queryLibrary(records, options) });
};
