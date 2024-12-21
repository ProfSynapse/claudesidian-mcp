"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateMaybeClassMetadataPostConstructor = updateMaybeClassMetadataPostConstructor;
const InversifyCoreError_1 = require("../../error/models/InversifyCoreError");
const InversifyCoreErrorKind_1 = require("../../error/models/InversifyCoreErrorKind");
function updateMaybeClassMetadataPostConstructor(methodName) {
    return (metadata) => {
        if (metadata.lifecycle.postConstructMethodName !== undefined) {
            throw new InversifyCoreError_1.InversifyCoreError(InversifyCoreErrorKind_1.InversifyCoreErrorKind.injectionDecoratorConflict, 'Unexpected duplicated postConstruct decorator');
        }
        metadata.lifecycle.postConstructMethodName = methodName;
        return metadata;
    };
}
//# sourceMappingURL=updateMaybeClassMetadataPostConstructor.js.map