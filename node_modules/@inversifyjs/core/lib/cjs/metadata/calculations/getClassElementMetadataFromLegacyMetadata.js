"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getClassElementMetadataFromLegacyMetadata = getClassElementMetadataFromLegacyMetadata;
const InversifyCoreError_1 = require("../../error/models/InversifyCoreError");
const InversifyCoreErrorKind_1 = require("../../error/models/InversifyCoreErrorKind");
const keys_1 = require("../../reflectMetadata/data/keys");
const ClassElementMetadataKind_1 = require("../models/ClassElementMetadataKind");
function getClassElementMetadataFromLegacyMetadata(metadataList) {
    const injectMetadata = metadataList.find((metadata) => metadata.key === keys_1.INJECT_TAG);
    const multiInjectMetadata = metadataList.find((metadata) => metadata.key === keys_1.MULTI_INJECT_TAG);
    const unmanagedMetadata = metadataList.find((metadata) => metadata.key === keys_1.UNMANAGED_TAG);
    if (unmanagedMetadata !== undefined) {
        return getUnmanagedClassElementMetadata(injectMetadata, multiInjectMetadata);
    }
    if (multiInjectMetadata === undefined && injectMetadata === undefined) {
        throw new InversifyCoreError_1.InversifyCoreError(InversifyCoreErrorKind_1.InversifyCoreErrorKind.missingInjectionDecorator, 'Expected @inject, @multiInject or @unmanaged metadata');
    }
    const nameMetadata = metadataList.find((metadata) => metadata.key === keys_1.NAMED_TAG);
    const optionalMetadata = metadataList.find((metadata) => metadata.key === keys_1.OPTIONAL_TAG);
    const targetNameMetadata = metadataList.find((metadata) => metadata.key === keys_1.NAME_TAG);
    const managedClassElementMetadata = {
        kind: injectMetadata === undefined
            ? ClassElementMetadataKind_1.ClassElementMetadataKind.multipleInjection
            : ClassElementMetadataKind_1.ClassElementMetadataKind.singleInjection,
        name: nameMetadata?.value,
        optional: optionalMetadata !== undefined,
        tags: new Map(metadataList
            .filter((metadata) => keys_1.NON_CUSTOM_TAG_KEYS.every((customTagKey) => metadata.key !== customTagKey))
            .map((metadata) => [
            metadata.key,
            metadata.value,
        ])),
        targetName: targetNameMetadata?.value,
        value: injectMetadata === undefined
            ? multiInjectMetadata?.value
            : injectMetadata.value,
    };
    return managedClassElementMetadata;
}
function getUnmanagedClassElementMetadata(injectMetadata, multiInjectMetadata) {
    if (multiInjectMetadata !== undefined || injectMetadata !== undefined) {
        throw new InversifyCoreError_1.InversifyCoreError(InversifyCoreErrorKind_1.InversifyCoreErrorKind.missingInjectionDecorator, 'Expected a single @inject, @multiInject or @unmanaged metadata');
    }
    return {
        kind: ClassElementMetadataKind_1.ClassElementMetadataKind.unmanaged,
    };
}
//# sourceMappingURL=getClassElementMetadataFromLegacyMetadata.js.map