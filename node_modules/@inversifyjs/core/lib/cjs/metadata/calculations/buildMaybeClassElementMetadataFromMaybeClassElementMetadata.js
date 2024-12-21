"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildMaybeClassElementMetadataFromMaybeClassElementMetadata = buildMaybeClassElementMetadataFromMaybeClassElementMetadata;
const InversifyCoreError_1 = require("../../error/models/InversifyCoreError");
const InversifyCoreErrorKind_1 = require("../../error/models/InversifyCoreErrorKind");
const ClassElementMetadataKind_1 = require("../models/ClassElementMetadataKind");
const buildDefaultMaybeClassElementMetadata_1 = require("./buildDefaultMaybeClassElementMetadata");
function buildMaybeClassElementMetadataFromMaybeClassElementMetadata(updateMetadata) {
    return (metadata) => {
        const definedMetadata = metadata ?? (0, buildDefaultMaybeClassElementMetadata_1.buildDefaultMaybeClassElementMetadata)();
        switch (definedMetadata.kind) {
            case ClassElementMetadataKind_1.ClassElementMetadataKind.unmanaged:
                throw new InversifyCoreError_1.InversifyCoreError(InversifyCoreErrorKind_1.InversifyCoreErrorKind.injectionDecoratorConflict, 'Unexpected injection found. Found @unmanaged injection with additional @named, @optional, @tagged or @targetName injections');
            default:
                return updateMetadata(definedMetadata);
        }
    };
}
//# sourceMappingURL=buildMaybeClassElementMetadataFromMaybeClassElementMetadata.js.map