"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LegacyQueryableStringImpl = void 0;
class LegacyQueryableStringImpl {
    #str;
    constructor(str) {
        this.#str = str;
    }
    startsWith(searchString) {
        return this.#str.startsWith(searchString);
    }
    endsWith(searchString) {
        return this.#str.endsWith(searchString);
    }
    contains(searchString) {
        return this.#str.includes(searchString);
    }
    equals(compareString) {
        return this.#str === compareString;
    }
    value() {
        return this.#str;
    }
}
exports.LegacyQueryableStringImpl = LegacyQueryableStringImpl;
//# sourceMappingURL=LegacyQueryableStringImpl.js.map