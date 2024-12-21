"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getClassMetadataFromMetadataReader = getClassMetadataFromMetadataReader;
const reflect_metadata_utils_1 = require("@inversifyjs/reflect-metadata-utils");
const keys_1 = require("../../reflectMetadata/data/keys");
const getClassMetadataConstructorArgumentsFromMetadataReader_1 = require("./getClassMetadataConstructorArgumentsFromMetadataReader");
const getClassMetadataPropertiesFromMetadataReader_1 = require("./getClassMetadataPropertiesFromMetadataReader");
function getClassMetadataFromMetadataReader(type, metadataReader) {
    const postConstructMetadata = (0, reflect_metadata_utils_1.getReflectMetadata)(type, keys_1.POST_CONSTRUCT);
    const preDestroyMetadata = (0, reflect_metadata_utils_1.getReflectMetadata)(type, keys_1.PRE_DESTROY);
    const classMetadata = {
        constructorArguments: (0, getClassMetadataConstructorArgumentsFromMetadataReader_1.getClassMetadataConstructorArgumentsFromMetadataReader)(type, metadataReader),
        lifecycle: {
            postConstructMethodName: postConstructMetadata?.value,
            preDestroyMethodName: preDestroyMetadata?.value,
        },
        properties: (0, getClassMetadataPropertiesFromMetadataReader_1.getClassMetadataPropertiesFromMetadataReader)(type, metadataReader),
    };
    return classMetadata;
}
//# sourceMappingURL=getClassMetadataFromMetadataReader.js.map