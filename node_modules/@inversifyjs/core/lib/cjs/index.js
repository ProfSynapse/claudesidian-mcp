"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LegacyTargetImpl = exports.getTargets = exports.getClassMetadataFromMetadataReader = exports.getClassMetadata = exports.getClassElementMetadataFromLegacyMetadata = exports.ClassElementMetadataKind = void 0;
const getTargets_1 = require("./legacyTarget/calculations/getTargets");
Object.defineProperty(exports, "getTargets", { enumerable: true, get: function () { return getTargets_1.getTargets; } });
const LegacyTargetImpl_1 = require("./legacyTarget/models/LegacyTargetImpl");
Object.defineProperty(exports, "LegacyTargetImpl", { enumerable: true, get: function () { return LegacyTargetImpl_1.LegacyTargetImpl; } });
const getClassElementMetadataFromLegacyMetadata_1 = require("./metadata/calculations/getClassElementMetadataFromLegacyMetadata");
Object.defineProperty(exports, "getClassElementMetadataFromLegacyMetadata", { enumerable: true, get: function () { return getClassElementMetadataFromLegacyMetadata_1.getClassElementMetadataFromLegacyMetadata; } });
const getClassMetadata_1 = require("./metadata/calculations/getClassMetadata");
Object.defineProperty(exports, "getClassMetadata", { enumerable: true, get: function () { return getClassMetadata_1.getClassMetadata; } });
const getClassMetadataFromMetadataReader_1 = require("./metadata/calculations/getClassMetadataFromMetadataReader");
Object.defineProperty(exports, "getClassMetadataFromMetadataReader", { enumerable: true, get: function () { return getClassMetadataFromMetadataReader_1.getClassMetadataFromMetadataReader; } });
const ClassElementMetadataKind_1 = require("./metadata/models/ClassElementMetadataKind");
Object.defineProperty(exports, "ClassElementMetadataKind", { enumerable: true, get: function () { return ClassElementMetadataKind_1.ClassElementMetadataKind; } });
//# sourceMappingURL=index.js.map