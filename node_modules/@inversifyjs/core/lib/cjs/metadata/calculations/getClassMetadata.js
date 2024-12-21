"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getClassMetadata = getClassMetadata;
const reflect_metadata_utils_1 = require("@inversifyjs/reflect-metadata-utils");
const keys_1 = require("../../reflectMetadata/data/keys");
const getClassMetadataConstructorArguments_1 = require("./getClassMetadataConstructorArguments");
const getClassMetadataProperties_1 = require("./getClassMetadataProperties");
function getClassMetadata(type) {
    const postConstructMetadata = (0, reflect_metadata_utils_1.getReflectMetadata)(type, keys_1.POST_CONSTRUCT);
    const preDestroyMetadata = (0, reflect_metadata_utils_1.getReflectMetadata)(type, keys_1.PRE_DESTROY);
    const classMetadata = {
        constructorArguments: (0, getClassMetadataConstructorArguments_1.getClassMetadataConstructorArguments)(type),
        lifecycle: {
            postConstructMethodName: postConstructMetadata?.value,
            preDestroyMethodName: preDestroyMetadata?.value,
        },
        properties: (0, getClassMetadataProperties_1.getClassMetadataProperties)(type),
    };
    return classMetadata;
}
//# sourceMappingURL=getClassMetadata.js.map