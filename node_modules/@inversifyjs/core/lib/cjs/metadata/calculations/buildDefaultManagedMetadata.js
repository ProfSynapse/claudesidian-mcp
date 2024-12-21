"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildDefaultManagedMetadata = buildDefaultManagedMetadata;
function buildDefaultManagedMetadata(kind, serviceIdentifier) {
    return {
        kind,
        name: undefined,
        optional: false,
        tags: new Map(),
        targetName: undefined,
        value: serviceIdentifier,
    };
}
//# sourceMappingURL=buildDefaultManagedMetadata.js.map