"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBaseType = getBaseType;
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
function getBaseType(type) {
    const prototype = Object.getPrototypeOf(type.prototype);
    const baseType = prototype?.constructor;
    return baseType;
}
//# sourceMappingURL=get_base_type.js.map