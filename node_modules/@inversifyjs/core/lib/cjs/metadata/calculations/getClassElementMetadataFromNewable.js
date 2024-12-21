"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getClassElementMetadataFromNewable = getClassElementMetadataFromNewable;
const ClassElementMetadataKind_1 = require("../models/ClassElementMetadataKind");
function getClassElementMetadataFromNewable(type) {
    return {
        kind: ClassElementMetadataKind_1.ClassElementMetadataKind.singleInjection,
        name: undefined,
        optional: false,
        tags: new Map(),
        targetName: undefined,
        value: type,
    };
}
//# sourceMappingURL=getClassElementMetadataFromNewable.js.map