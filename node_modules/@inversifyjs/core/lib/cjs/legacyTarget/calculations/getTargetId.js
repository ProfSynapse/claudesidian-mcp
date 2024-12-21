"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTargetId = getTargetId;
const reflect_metadata_utils_1 = require("@inversifyjs/reflect-metadata-utils");
const ID_METADATA = '@inversifyjs/core/targetId';
function getTargetId() {
    const targetId = (0, reflect_metadata_utils_1.getReflectMetadata)(Object, ID_METADATA) ?? 0;
    if (targetId === Number.MAX_SAFE_INTEGER) {
        (0, reflect_metadata_utils_1.updateReflectMetadata)(Object, ID_METADATA, targetId, () => Number.MIN_SAFE_INTEGER);
    }
    else {
        (0, reflect_metadata_utils_1.updateReflectMetadata)(Object, ID_METADATA, targetId, (id) => id + 1);
    }
    return targetId;
}
//# sourceMappingURL=getTargetId.js.map