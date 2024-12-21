"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildUnmanagedMetadataFromMaybeManagedMetadata = buildUnmanagedMetadataFromMaybeManagedMetadata;
const InversifyCoreError_1 = require("../../error/models/InversifyCoreError");
const InversifyCoreErrorKind_1 = require("../../error/models/InversifyCoreErrorKind");
const buildDefaultUnmanagedMetadata_1 = require("./buildDefaultUnmanagedMetadata");
function buildUnmanagedMetadataFromMaybeManagedMetadata(metadata) {
    if (hasManagedMetadata(metadata)) {
        throw new InversifyCoreError_1.InversifyCoreError(InversifyCoreErrorKind_1.InversifyCoreErrorKind.injectionDecoratorConflict, 'Unexpected injection found. Found @unmanaged injection with additional @named, @optional, @tagged or @targetName injections');
    }
    return (0, buildDefaultUnmanagedMetadata_1.buildDefaultUnmanagedMetadata)();
}
function hasManagedMetadata(metadata) {
    return (metadata.name !== undefined ||
        metadata.optional ||
        metadata.tags.size > 0 ||
        metadata.targetName !== undefined);
}
//# sourceMappingURL=buildUnmanagedMetadataFromMaybeManagedMetadata.js.map