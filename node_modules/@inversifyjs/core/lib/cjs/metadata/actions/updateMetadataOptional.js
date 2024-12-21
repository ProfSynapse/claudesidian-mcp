"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateMetadataOptional = updateMetadataOptional;
const InversifyCoreError_1 = require("../../error/models/InversifyCoreError");
const InversifyCoreErrorKind_1 = require("../../error/models/InversifyCoreErrorKind");
function updateMetadataOptional(metadata) {
    if (metadata.optional) {
        throw new InversifyCoreError_1.InversifyCoreError(InversifyCoreErrorKind_1.InversifyCoreErrorKind.injectionDecoratorConflict, 'Unexpected duplicated optional decorator');
    }
    metadata.optional = true;
    return metadata;
}
//# sourceMappingURL=updateMetadataOptional.js.map