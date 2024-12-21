"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.multiInject = multiInject;
const buildManagedMetadataFromMaybeClassElementMetadata_1 = require("../calculations/buildManagedMetadataFromMaybeClassElementMetadata");
const handleInjectionError_1 = require("../calculations/handleInjectionError");
const ClassElementMetadataKind_1 = require("../models/ClassElementMetadataKind");
const injectBase_1 = require("./injectBase");
function multiInject(serviceIdentifier) {
    const updateMetadata = (0, buildManagedMetadataFromMaybeClassElementMetadata_1.buildManagedMetadataFromMaybeClassElementMetadata)(ClassElementMetadataKind_1.ClassElementMetadataKind.multipleInjection, serviceIdentifier);
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
//# sourceMappingURL=multiInject.js.map