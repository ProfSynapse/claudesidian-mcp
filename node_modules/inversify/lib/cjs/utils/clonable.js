"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isClonable = isClonable;
function isClonable(obj) {
    return (typeof obj === 'object' &&
        obj !== null &&
        'clone' in obj &&
        typeof obj.clone === 'function');
}
//# sourceMappingURL=clonable.js.map