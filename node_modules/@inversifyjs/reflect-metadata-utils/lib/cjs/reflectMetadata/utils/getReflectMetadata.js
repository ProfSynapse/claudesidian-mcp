"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getReflectMetadata = getReflectMetadata;
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
function getReflectMetadata(target, metadataKey) {
    return Reflect.getMetadata(metadataKey, target);
}
//# sourceMappingURL=getReflectMetadata.js.map