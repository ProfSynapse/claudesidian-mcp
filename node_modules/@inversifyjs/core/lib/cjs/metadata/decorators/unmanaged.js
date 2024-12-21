"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.unmanaged = unmanaged;
const buildUnmanagedMetadataFromMaybeClassElementMetadata_1 = require("../calculations/buildUnmanagedMetadataFromMaybeClassElementMetadata");
const handleInjectionError_1 = require("../calculations/handleInjectionError");
const injectBase_1 = require("./injectBase");
function unmanaged() {
    const updateMetadata = (0, buildUnmanagedMetadataFromMaybeClassElementMetadata_1.buildUnmanagedMetadataFromMaybeClassElementMetadata)();
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
//# sourceMappingURL=unmanaged.js.map