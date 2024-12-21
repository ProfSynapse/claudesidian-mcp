"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isPromise = isPromise;
exports.isPromiseOrContainsPromise = isPromiseOrContainsPromise;
function isPromise(object) {
    const isObjectOrFunction = (typeof object === 'object' && object !== null) ||
        typeof object === 'function';
    return (isObjectOrFunction && typeof object.then === 'function');
}
function isPromiseOrContainsPromise(object) {
    if (isPromise(object)) {
        return true;
    }
    return Array.isArray(object) && object.some(isPromise);
}
//# sourceMappingURL=async.js.map