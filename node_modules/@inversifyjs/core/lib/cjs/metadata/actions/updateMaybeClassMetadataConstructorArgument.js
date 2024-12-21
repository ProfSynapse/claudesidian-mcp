"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateMaybeClassMetadataConstructorArgument = updateMaybeClassMetadataConstructorArgument;
function updateMaybeClassMetadataConstructorArgument(updateMetadata, index) {
    return (classMetadata) => {
        const propertyMetadata = classMetadata.constructorArguments[index];
        classMetadata.constructorArguments[index] =
            updateMetadata(propertyMetadata);
        return classMetadata;
    };
}
//# sourceMappingURL=updateMaybeClassMetadataConstructorArgument.js.map