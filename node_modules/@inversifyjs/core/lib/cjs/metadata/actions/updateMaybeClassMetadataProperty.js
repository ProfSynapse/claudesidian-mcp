"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateMaybeClassMetadataProperty = updateMaybeClassMetadataProperty;
function updateMaybeClassMetadataProperty(updateMetadata, propertyKey) {
    return (classMetadata) => {
        const propertyMetadata = classMetadata.properties.get(propertyKey);
        classMetadata.properties.set(propertyKey, updateMetadata(propertyMetadata));
        return classMetadata;
    };
}
//# sourceMappingURL=updateMaybeClassMetadataProperty.js.map