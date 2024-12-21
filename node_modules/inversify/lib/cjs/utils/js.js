"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFirstArrayDuplicate = getFirstArrayDuplicate;
function getFirstArrayDuplicate(array) {
    const seenValues = new Set();
    for (const entry of array) {
        if (seenValues.has(entry)) {
            return entry;
        }
        else {
            seenValues.add(entry);
        }
    }
    return undefined;
}
//# sourceMappingURL=js.js.map