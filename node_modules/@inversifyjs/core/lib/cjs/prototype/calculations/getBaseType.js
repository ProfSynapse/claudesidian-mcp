"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBaseType = getBaseType;
function getBaseType(type) {
    const prototype = Object.getPrototypeOf(type.prototype);
    const baseType = prototype?.constructor;
    return baseType;
}
//# sourceMappingURL=getBaseType.js.map