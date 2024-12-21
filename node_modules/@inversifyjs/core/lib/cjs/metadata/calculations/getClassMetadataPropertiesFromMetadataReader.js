"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getClassMetadataPropertiesFromMetadataReader = getClassMetadataPropertiesFromMetadataReader;
const getPropertyMetadataFromLegacyMetadata_1 = require("./getPropertyMetadataFromLegacyMetadata");
function getClassMetadataPropertiesFromMetadataReader(type, metadataReader) {
    const propertiesLegacyMetadata = metadataReader.getPropertiesMetadata(type);
    const propertiesMetadata = new Map();
    for (const property of Reflect.ownKeys(propertiesLegacyMetadata)) {
        const legacyMetadata = propertiesLegacyMetadata[property];
        propertiesMetadata.set(property, (0, getPropertyMetadataFromLegacyMetadata_1.getPropertyMetadataFromLegacyMetadata)(type, property, legacyMetadata));
    }
    return propertiesMetadata;
}
//# sourceMappingURL=getClassMetadataPropertiesFromMetadataReader.js.map