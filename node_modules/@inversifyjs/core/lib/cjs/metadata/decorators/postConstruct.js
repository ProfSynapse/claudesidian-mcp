"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.postConstruct = postConstruct;
const reflect_metadata_utils_1 = require("@inversifyjs/reflect-metadata-utils");
const classMetadataReflectKey_1 = require("../../reflectMetadata/data/classMetadataReflectKey");
const updateMaybeClassMetadataPostConstructor_1 = require("../actions/updateMaybeClassMetadataPostConstructor");
const getDefaultClassMetadata_1 = require("../calculations/getDefaultClassMetadata");
const handleInjectionError_1 = require("../calculations/handleInjectionError");
function postConstruct() {
    return (target, propertyKey, _descriptor) => {
        try {
            (0, reflect_metadata_utils_1.updateReflectMetadata)(target.constructor, classMetadataReflectKey_1.classMetadataReflectKey, (0, getDefaultClassMetadata_1.getDefaultClassMetadata)(), (0, updateMaybeClassMetadataPostConstructor_1.updateMaybeClassMetadataPostConstructor)(propertyKey));
        }
        catch (error) {
            (0, handleInjectionError_1.handleInjectionError)(target, propertyKey, undefined, error);
        }
    };
}
//# sourceMappingURL=postConstruct.js.map