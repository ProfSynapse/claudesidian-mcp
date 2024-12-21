"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InversifyCoreError = exports.isAppErrorSymbol = void 0;
exports.isAppErrorSymbol = Symbol.for('@inversifyjs/core/InversifyCoreError');
class InversifyCoreError extends Error {
    [exports.isAppErrorSymbol];
    kind;
    constructor(kind, message, options) {
        super(message, options);
        this[exports.isAppErrorSymbol] = true;
        this.kind = kind;
    }
    static is(value) {
        return (typeof value === 'object' &&
            value !== null &&
            value[exports.isAppErrorSymbol] === true);
    }
    static isErrorOfKind(value, kind) {
        return InversifyCoreError.is(value) && value.kind === kind;
    }
}
exports.InversifyCoreError = InversifyCoreError;
//# sourceMappingURL=InversifyCoreError.js.map