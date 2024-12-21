"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDescription = getDescription;
const SYMBOL_INDEX_START = 7;
const SYMBOL_INDEX_END = -1;
function getDescription(symbol) {
    return symbol.toString().slice(SYMBOL_INDEX_START, SYMBOL_INDEX_END);
}
//# sourceMappingURL=getDescription.js.map