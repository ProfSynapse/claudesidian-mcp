"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTargetsFromMetadataProviders = getTargetsFromMetadataProviders;
const ClassElementMetadataKind_1 = require("../../metadata/models/ClassElementMetadataKind");
const getBaseType_1 = require("../../prototype/calculations/getBaseType");
const LegacyTargetImpl_1 = require("../models/LegacyTargetImpl");
function getTargetsFromMetadataProviders(getClassMetadata, getClassMetadataProperties) {
    return function getTagets(type) {
        const classMetadata = getClassMetadata(type);
        let baseType = (0, getBaseType_1.getBaseType)(type);
        while (baseType !== undefined && baseType !== Object) {
            const classMetadataProperties = getClassMetadataProperties(baseType);
            for (const [propertyKey, propertyValue] of classMetadataProperties) {
                if (!classMetadata.properties.has(propertyKey)) {
                    classMetadata.properties.set(propertyKey, propertyValue);
                }
            }
            baseType = (0, getBaseType_1.getBaseType)(baseType);
        }
        const targets = [];
        for (const constructorArgument of classMetadata.constructorArguments) {
            if (constructorArgument.kind !== ClassElementMetadataKind_1.ClassElementMetadataKind.unmanaged) {
                const targetName = constructorArgument.targetName ?? '';
                targets.push(new LegacyTargetImpl_1.LegacyTargetImpl(targetName, constructorArgument, 'ConstructorArgument'));
            }
        }
        for (const [property, metadata] of classMetadata.properties) {
            if (metadata.kind !== ClassElementMetadataKind_1.ClassElementMetadataKind.unmanaged) {
                const targetName = metadata.targetName ?? property;
                targets.push(new LegacyTargetImpl_1.LegacyTargetImpl(targetName, metadata, 'ClassProperty'));
            }
        }
        return targets;
    };
}
//# sourceMappingURL=getTargetsFromMetadataProviders.js.map