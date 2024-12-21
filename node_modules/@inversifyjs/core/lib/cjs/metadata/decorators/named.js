"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.named = named;
const updateMetadataName_1 = require("../actions/updateMetadataName");
const buildMaybeClassElementMetadataFromMaybeClassElementMetadata_1 = require("../calculations/buildMaybeClassElementMetadataFromMaybeClassElementMetadata");
const handleInjectionError_1 = require("../calculations/handleInjectionError");
const injectBase_1 = require("./injectBase");
function named(name) {
    const updateMetadata = (0, buildMaybeClassElementMetadataFromMaybeClassElementMetadata_1.buildMaybeClassElementMetadataFromMaybeClassElementMetadata)((0, updateMetadataName_1.updateMetadataName)(name));
    return (target, propertyKey, parameterIndex) => {
        try {
            if (parameterIndex === undefined) {
                (0, injectBase_1.injectBase)(updateMetadata)(target, propertyKey);
            }
            else {
                (0, injectBase_1.injectBase)(updateMetadata)(target, propertyKey, parameterIndex);
            }
        }
        catch (error) {
            (0, handleInjectionError_1.handleInjectionError)(target, propertyKey, parameterIndex, error);
        }
    };
}
//# sourceMappingURL=named.js.map