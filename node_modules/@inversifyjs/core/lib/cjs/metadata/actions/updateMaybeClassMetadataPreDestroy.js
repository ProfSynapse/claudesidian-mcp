"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateMaybeClassMetadataPreDestroy = updateMaybeClassMetadataPreDestroy;
const InversifyCoreError_1 = require("../../error/models/InversifyCoreError");
const InversifyCoreErrorKind_1 = require("../../error/models/InversifyCoreErrorKind");
function updateMaybeClassMetadataPreDestroy(methodName) {
    return (metadata) => {
        if (metadata.lifecycle.preDestroyMethodName !== undefined) {
            throw new InversifyCoreError_1.InversifyCoreError(InversifyCoreErrorKind_1.InversifyCoreErrorKind.injectionDecoratorConflict, 'Unexpected duplicated preDestroy decorator');
        }
        metadata.lifecycle.preDestroyMethodName = methodName;
        return metadata;
    };
}
//# sourceMappingURL=updateMaybeClassMetadataPreDestroy.js.map