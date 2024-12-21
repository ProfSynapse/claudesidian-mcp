"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTargets = void 0;
const getClassMetadata_1 = require("../../metadata/calculations/getClassMetadata");
const getClassMetadataFromMetadataReader_1 = require("../../metadata/calculations/getClassMetadataFromMetadataReader");
const getClassMetadataProperties_1 = require("../../metadata/calculations/getClassMetadataProperties");
const getClassMetadataPropertiesFromMetadataReader_1 = require("../../metadata/calculations/getClassMetadataPropertiesFromMetadataReader");
const getTargetsFromMetadataProviders_1 = require("./getTargetsFromMetadataProviders");
const getTargets = (metadataReader) => {
    const getClassMetadataFn = metadataReader === undefined
        ? getClassMetadata_1.getClassMetadata
        : (type) => (0, getClassMetadataFromMetadataReader_1.getClassMetadataFromMetadataReader)(type, metadataReader);
    const getClassMetadataPropertiesFn = metadataReader === undefined
        ? getClassMetadataProperties_1.getClassMetadataProperties
        : (type) => (0, getClassMetadataPropertiesFromMetadataReader_1.getClassMetadataPropertiesFromMetadataReader)(type, metadataReader);
    return (0, getTargetsFromMetadataProviders_1.getTargetsFromMetadataProviders)(getClassMetadataFn, getClassMetadataPropertiesFn);
};
exports.getTargets = getTargets;
//# sourceMappingURL=getTargets.js.map