"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLegacyMetadata = getLegacyMetadata;
const keys_1 = require("../../reflectMetadata/data/keys");
const ClassElementMetadataKind_1 = require("../models/ClassElementMetadataKind");
function getLegacyMetadata(classElementMetadata) {
    switch (classElementMetadata.kind) {
        case ClassElementMetadataKind_1.ClassElementMetadataKind.unmanaged:
            return getUnmanagedLegacyMetadata();
        default:
            return getManagedLegacyMetadata(classElementMetadata);
    }
}
function getManagedLegacyMetadata(classElementMetadata) {
    const legacyMetadataList = [
        getManagedKindLegacyMetadata(classElementMetadata),
    ];
    if (classElementMetadata.name !== undefined) {
        legacyMetadataList.push({
            key: keys_1.NAMED_TAG,
            value: classElementMetadata.name,
        });
    }
    if (classElementMetadata.optional) {
        legacyMetadataList.push({
            key: keys_1.OPTIONAL_TAG,
            value: true,
        });
    }
    for (const [tagKey, tagValue] of classElementMetadata.tags) {
        legacyMetadataList.push({
            key: tagKey,
            value: tagValue,
        });
    }
    if (classElementMetadata.targetName !== undefined) {
        legacyMetadataList.push({
            key: keys_1.NAME_TAG,
            value: classElementMetadata.targetName,
        });
    }
    return legacyMetadataList;
}
function getManagedKindLegacyMetadata(classElementMetadata) {
    let kindLegacyMetadata;
    switch (classElementMetadata.kind) {
        case ClassElementMetadataKind_1.ClassElementMetadataKind.multipleInjection:
            kindLegacyMetadata = {
                key: keys_1.MULTI_INJECT_TAG,
                value: classElementMetadata.value,
            };
            break;
        case ClassElementMetadataKind_1.ClassElementMetadataKind.singleInjection:
            kindLegacyMetadata = {
                key: keys_1.INJECT_TAG,
                value: classElementMetadata.value,
            };
            break;
    }
    return kindLegacyMetadata;
}
function getUnmanagedLegacyMetadata() {
    return [
        {
            key: keys_1.UNMANAGED_TAG,
            value: true,
        },
    ];
}
//# sourceMappingURL=getLegacyMetadata.js.map