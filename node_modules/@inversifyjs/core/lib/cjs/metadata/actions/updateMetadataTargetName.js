"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateMetadataTargetName = updateMetadataTargetName;
const InversifyCoreError_1 = require("../../error/models/InversifyCoreError");
const InversifyCoreErrorKind_1 = require("../../error/models/InversifyCoreErrorKind");
function updateMetadataTargetName(targetName) {
    return (metadata) => {
        if (metadata.targetName !== undefined) {
            throw new InversifyCoreError_1.InversifyCoreError(InversifyCoreErrorKind_1.InversifyCoreErrorKind.injectionDecoratorConflict, 'Unexpected duplicated targetName decorator');
        }
        metadata.targetName = targetName;
        return metadata;
    };
}
//# sourceMappingURL=updateMetadataTargetName.js.map