"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.injectBase = injectBase;
const reflect_metadata_utils_1 = require("@inversifyjs/reflect-metadata-utils");
const classMetadataReflectKey_1 = require("../../reflectMetadata/data/classMetadataReflectKey");
const updateMaybeClassMetadataConstructorArgument_1 = require("../actions/updateMaybeClassMetadataConstructorArgument");
const updateMaybeClassMetadataProperty_1 = require("../actions/updateMaybeClassMetadataProperty");
const getDefaultClassMetadata_1 = require("../calculations/getDefaultClassMetadata");
function injectBase(updateMetadata) {
    const decorator = (target, propertyKey, parameterIndex) => {
        if (parameterIndex === undefined) {
            injectProperty(updateMetadata)(target, propertyKey);
        }
        else {
            injectParameter(updateMetadata)(target, propertyKey, parameterIndex);
        }
    };
    return decorator;
}
function injectParameter(updateMetadata) {
    return (target, propertyKey, parameterIndex) => {
        if (isConstructorParameter(target, propertyKey)) {
            (0, reflect_metadata_utils_1.updateReflectMetadata)(target, classMetadataReflectKey_1.classMetadataReflectKey, (0, getDefaultClassMetadata_1.getDefaultClassMetadata)(), (0, updateMaybeClassMetadataConstructorArgument_1.updateMaybeClassMetadataConstructorArgument)(updateMetadata, parameterIndex));
        }
        else {
            throw new Error(`Found an @inject decorator in a non constructor parameter.
Found @inject decorator at method "${propertyKey?.toString() ?? ''}" at class "${target.constructor.name}"`);
        }
    };
}
function injectProperty(updateMetadata) {
    return (target, propertyKey) => {
        (0, reflect_metadata_utils_1.updateReflectMetadata)(target.constructor, classMetadataReflectKey_1.classMetadataReflectKey, (0, getDefaultClassMetadata_1.getDefaultClassMetadata)(), (0, updateMaybeClassMetadataProperty_1.updateMaybeClassMetadataProperty)(updateMetadata, propertyKey));
    };
}
function isConstructorParameter(target, propertyKey) {
    return typeof target === 'function' && propertyKey === undefined;
}
//# sourceMappingURL=injectBase.js.map