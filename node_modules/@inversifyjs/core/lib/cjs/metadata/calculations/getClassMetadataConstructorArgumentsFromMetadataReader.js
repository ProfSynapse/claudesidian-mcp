"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getClassMetadataConstructorArgumentsFromMetadataReader = getClassMetadataConstructorArgumentsFromMetadataReader;
const assertConstructorMetadataArrayFilled_1 = require("./assertConstructorMetadataArrayFilled");
const getClassElementMetadataFromNewable_1 = require("./getClassElementMetadataFromNewable");
const getConstructorArgumentMetadataFromLegacyMetadata_1 = require("./getConstructorArgumentMetadataFromLegacyMetadata");
function getClassMetadataConstructorArgumentsFromMetadataReader(type, metadataReader) {
    const legacyConstructorMetadata = metadataReader.getConstructorMetadata(type);
    const constructorArgumentsMetadata = [];
    for (const [stringifiedIndex, metadataList] of Object.entries(legacyConstructorMetadata.userGeneratedMetadata)) {
        const index = parseInt(stringifiedIndex);
        constructorArgumentsMetadata[index] =
            (0, getConstructorArgumentMetadataFromLegacyMetadata_1.getConstructorArgumentMetadataFromLegacyMetadata)(type, index, metadataList);
    }
    if (legacyConstructorMetadata.compilerGeneratedMetadata !== undefined) {
        for (let i = 0; i < legacyConstructorMetadata.compilerGeneratedMetadata.length; ++i) {
            if (constructorArgumentsMetadata[i] === undefined) {
                const typescriptMetadata = legacyConstructorMetadata
                    .compilerGeneratedMetadata[i];
                constructorArgumentsMetadata[i] =
                    (0, getClassElementMetadataFromNewable_1.getClassElementMetadataFromNewable)(typescriptMetadata);
            }
        }
    }
    (0, assertConstructorMetadataArrayFilled_1.assertConstructorMetadataArrayFilled)(type, constructorArgumentsMetadata);
    return constructorArgumentsMetadata;
}
//# sourceMappingURL=getClassMetadataConstructorArgumentsFromMetadataReader.js.map