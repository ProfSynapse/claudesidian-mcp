"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPropertyMetadataFromLegacyMetadata = getPropertyMetadataFromLegacyMetadata;
const InversifyCoreError_1 = require("../../error/models/InversifyCoreError");
const InversifyCoreErrorKind_1 = require("../../error/models/InversifyCoreErrorKind");
const getClassElementMetadataFromLegacyMetadata_1 = require("./getClassElementMetadataFromLegacyMetadata");
function getPropertyMetadataFromLegacyMetadata(type, key, metadataList) {
    try {
        return (0, getClassElementMetadataFromLegacyMetadata_1.getClassElementMetadataFromLegacyMetadata)(metadataList);
    }
    catch (error) {
        if (InversifyCoreError_1.InversifyCoreError.isErrorOfKind(error, InversifyCoreErrorKind_1.InversifyCoreErrorKind.missingInjectionDecorator)) {
            throw new InversifyCoreError_1.InversifyCoreError(InversifyCoreErrorKind_1.InversifyCoreErrorKind.missingInjectionDecorator, `Expected a single @inject, @multiInject or @unmanaged decorator at type "${type.name}" at property "${key.toString()}"`, { cause: error });
        }
        else {
            throw error;
        }
    }
}
//# sourceMappingURL=getPropertyMetadataFromLegacyMetadata.js.map