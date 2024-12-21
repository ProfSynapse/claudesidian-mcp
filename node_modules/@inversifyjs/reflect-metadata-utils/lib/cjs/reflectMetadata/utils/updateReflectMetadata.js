"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateReflectMetadata = updateReflectMetadata;
const getReflectMetadata_1 = require("./getReflectMetadata");
function updateReflectMetadata(target, metadataKey, defaultValue, callback) {
    const metadata = (0, getReflectMetadata_1.getReflectMetadata)(target, metadataKey) ?? defaultValue;
    const updatedMetadata = callback(metadata);
    Reflect.defineMetadata(metadataKey, updatedMetadata, target);
}
//# sourceMappingURL=updateReflectMetadata.js.map