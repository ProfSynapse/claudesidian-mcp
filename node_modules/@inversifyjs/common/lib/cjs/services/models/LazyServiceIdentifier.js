"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LazyServiceIdentifier = exports.islazyServiceIdentifierSymbol = void 0;
exports.islazyServiceIdentifierSymbol = Symbol.for('@inversifyjs/common/islazyServiceIdentifier');
class LazyServiceIdentifier {
    [exports.islazyServiceIdentifierSymbol];
    #buildServiceId;
    constructor(buildServiceId) {
        this.#buildServiceId = buildServiceId;
        this[exports.islazyServiceIdentifierSymbol] = true;
    }
    static is(value) {
        return (typeof value === 'object' &&
            value !== null &&
            value[exports.islazyServiceIdentifierSymbol] === true);
    }
    unwrap() {
        return this.#buildServiceId();
    }
}
exports.LazyServiceIdentifier = LazyServiceIdentifier;
//# sourceMappingURL=LazyServiceIdentifier.js.map