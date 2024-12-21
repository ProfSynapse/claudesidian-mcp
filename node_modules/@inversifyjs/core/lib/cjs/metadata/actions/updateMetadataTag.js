"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateMetadataTag = updateMetadataTag;
const InversifyCoreError_1 = require("../../error/models/InversifyCoreError");
const InversifyCoreErrorKind_1 = require("../../error/models/InversifyCoreErrorKind");
function updateMetadataTag(key, value) {
    return (metadata) => {
        if (metadata.tags.has(key)) {
            throw new InversifyCoreError_1.InversifyCoreError(InversifyCoreErrorKind_1.InversifyCoreErrorKind.injectionDecoratorConflict, 'Unexpected duplicated tag decorator with existing tag');
        }
        metadata.tags.set(key, value);
        return metadata;
    };
}
//# sourceMappingURL=updateMetadataTag.js.map