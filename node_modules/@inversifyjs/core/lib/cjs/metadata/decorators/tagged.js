"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tagged = tagged;
const updateMetadataTag_1 = require("../actions/updateMetadataTag");
const buildMaybeClassElementMetadataFromMaybeClassElementMetadata_1 = require("../calculations/buildMaybeClassElementMetadataFromMaybeClassElementMetadata");
const handleInjectionError_1 = require("../calculations/handleInjectionError");
const injectBase_1 = require("./injectBase");
function tagged(key, value) {
    const updateMetadata = (0, buildMaybeClassElementMetadataFromMaybeClassElementMetadata_1.buildMaybeClassElementMetadataFromMaybeClassElementMetadata)((0, updateMetadataTag_1.updateMetadataTag)(key, value));
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
//# sourceMappingURL=tagged.js.map