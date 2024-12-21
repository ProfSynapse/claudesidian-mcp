"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildClassElementMetadataFromMaybeClassElementMetadata = buildClassElementMetadataFromMaybeClassElementMetadata;
const InversifyCoreError_1 = require("../../error/models/InversifyCoreError");
const InversifyCoreErrorKind_1 = require("../../error/models/InversifyCoreErrorKind");
const MaybeClassElementMetadataKind_1 = require("../models/MaybeClassElementMetadataKind");
function buildClassElementMetadataFromMaybeClassElementMetadata(buildDefaultMetadata, buildMetadataFromMaybeManagedMetadata) {
    return (...params) => (metadata) => {
        if (metadata === undefined) {
            return buildDefaultMetadata(...params);
        }
        switch (metadata.kind) {
            case MaybeClassElementMetadataKind_1.MaybeClassElementMetadataKind.unknown:
                return buildMetadataFromMaybeManagedMetadata(metadata, ...params);
            default:
                throw new InversifyCoreError_1.InversifyCoreError(InversifyCoreErrorKind_1.InversifyCoreErrorKind.injectionDecoratorConflict, 'Unexpected injection found. Multiple @inject, @multiInject or @unmanaged decorators found');
        }
    };
}
//# sourceMappingURL=buildClassElementMetadataFromMaybeClassElementMetadata.js.map