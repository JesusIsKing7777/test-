'use strict';

const { normalizeJson, canonicalize } = require('./dataverse_v5_core');
const { ValidationError } = require('./errors');

class LWWMap {
  #store = new Map(); // key -> { value, timestamp, nodeId }
  #tombstones = new Map(); // key -> { timestamp, nodeId }

  constructor(nodeId) {
    if (!nodeId) throw new ValidationError('LWWMap requires a nodeId');
    this.nodeId = nodeId;
    this.lamport = 0;
  }

  set(key, rawValue) {
    if (typeof key !== 'string') throw new ValidationError('Map keys must be strings');
    const value = normalizeJson(rawValue);
    this.lamport++;
    const timestamp = this.lamport;
    
    this.#store.set(key, { value, timestamp, nodeId: this.nodeId });
    // Clear tombstone if re-inserting
    this.#tombstones.delete(key);
    return { key, value, timestamp, nodeId: this.nodeId };
  }

  get(key) {
    if (this.#tombstones.has(key)) return undefined;
    const entry = this.#store.get(key);
    return entry ? entry.value : undefined;
  }

  delete(key) {
    if (typeof key !== 'string') throw new ValidationError('Map keys must be strings');
    this.lamport++;
    const timestamp = this.lamport;

    if (this.#store.has(key) || !this.#tombstones.has(key)) {
      this.#tombstones.set(key, { timestamp, nodeId: this.nodeId });
      this.#store.delete(key);
      return true;
    }
    return false;
  }

  toJSON() {
    const obj = {};
    for (const [k, entry] of this.#store.entries()) {
      obj[k] = entry.value;
    }
    return obj;
  }
}

module.exports = { LWWMap };
