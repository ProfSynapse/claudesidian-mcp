"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildManagedMetadataFromMaybeClassElementMetadata = void 0;
const buildClassElementMetadataFromMaybeClassElementMetadata_1 = require("./buildClassElementMetadataFromMaybeClassElementMetadata");
const buildDefaultManagedMetadata_1 = require("./buildDefaultManagedMetadata");
const buildManagedMetadataFromMaybeManagedMetadata_1 = require("./buildManagedMetadataFromMaybeManagedMetadata");
exports.buildManagedMetadataFromMaybeClassElementMetadata = (0, buildClassElementMetadataFromMaybeClassElementMetadata_1.buildClassElementMetadataFromMaybeClassElementMetadata)(buildDefaultManagedMetadata_1.buildDefaultManagedMetadata, buildManagedMetadataFromMaybeManagedMetadata_1.buildManagedMetadataFromMaybeManagedMetadata);
//# sourceMappingURL=buildManagedMetadataFromMaybeClassElementMetadata.js.map