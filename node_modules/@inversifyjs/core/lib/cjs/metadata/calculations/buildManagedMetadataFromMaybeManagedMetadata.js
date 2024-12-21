"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildManagedMetadataFromMaybeManagedMetadata = buildManagedMetadataFromMaybeManagedMetadata;
function buildManagedMetadataFromMaybeManagedMetadata(metadata, kind, serviceIdentifier) {
    return {
        ...metadata,
        kind,
        value: serviceIdentifier,
    };
}
//# sourceMappingURL=buildManagedMetadataFromMaybeManagedMetadata.js.map