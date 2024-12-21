"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildDefaultMaybeClassElementMetadata = buildDefaultMaybeClassElementMetadata;
const MaybeClassElementMetadataKind_1 = require("../models/MaybeClassElementMetadataKind");
function buildDefaultMaybeClassElementMetadata() {
    return {
        kind: MaybeClassElementMetadataKind_1.MaybeClassElementMetadataKind.unknown,
        name: undefined,
        optional: false,
        tags: new Map(),
        targetName: undefined,
    };
}
//# sourceMappingURL=buildDefaultMaybeClassElementMetadata.js.map