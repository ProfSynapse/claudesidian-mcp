"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateMetadataName = updateMetadataName;
const InversifyCoreError_1 = require("../../error/models/InversifyCoreError");
const InversifyCoreErrorKind_1 = require("../../error/models/InversifyCoreErrorKind");
function updateMetadataName(name) {
    return (metadata) => {
        if (metadata.name !== undefined) {
            throw new InversifyCoreError_1.InversifyCoreError(InversifyCoreErrorKind_1.InversifyCoreErrorKind.injectionDecoratorConflict, 'Unexpected duplicated named decorator');
        }
        metadata.name = name;
        return metadata;
    };
}
//# sourceMappingURL=updateMetadataName.js.map