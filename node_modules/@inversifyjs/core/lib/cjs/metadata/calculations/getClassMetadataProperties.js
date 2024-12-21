"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getClassMetadataProperties = getClassMetadataProperties;
const reflect_metadata_utils_1 = require("@inversifyjs/reflect-metadata-utils");
const keys_1 = require("../../reflectMetadata/data/keys");
const getPropertyMetadataFromLegacyMetadata_1 = require("./getPropertyMetadataFromLegacyMetadata");
function getClassMetadataProperties(type) {
    const propertiesLegacyMetadata = (0, reflect_metadata_utils_1.getReflectMetadata)(type, keys_1.TAGGED_PROP);
    const propertiesMetadata = new Map();
    if (propertiesLegacyMetadata !== undefined) {
        for (const property of Reflect.ownKeys(propertiesLegacyMetadata)) {
            const legacyMetadata = propertiesLegacyMetadata[property];
            propertiesMetadata.set(property, (0, getPropertyMetadataFromLegacyMetadata_1.getPropertyMetadataFromLegacyMetadata)(type, property, legacyMetadata));
        }
    }
    return propertiesMetadata;
}
//# sourceMappingURL=getClassMetadataProperties.js.map