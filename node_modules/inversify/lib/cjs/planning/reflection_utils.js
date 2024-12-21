"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFunctionName = void 0;
exports.getDependencies = getDependencies;
exports.getBaseClassDependencyCount = getBaseClassDependencyCount;
const core_1 = require("@inversifyjs/core");
const METADATA_KEY = __importStar(require("../constants/metadata_keys"));
const get_base_type_1 = require("../utils/get_base_type");
const serialization_1 = require("../utils/serialization");
Object.defineProperty(exports, "getFunctionName", { enumerable: true, get: function () { return serialization_1.getFunctionName; } });
function getDependencies(metadataReader, func) {
    return (0, core_1.getTargets)(metadataReader)(func);
}
function getBaseClassDependencyCount(metadataReader, func) {
    const baseConstructor = (0, get_base_type_1.getBaseType)(func);
    if (baseConstructor === undefined || baseConstructor === Object) {
        return 0;
    }
    // get targets for base class
    const targets = (0, core_1.getTargets)(metadataReader)(baseConstructor);
    // get unmanaged metadata
    const metadata = targets.map((t) => t.metadata.filter((m) => m.key === METADATA_KEY.UNMANAGED_TAG));
    // Compare the number of constructor arguments with the number of
    // unmanaged dependencies unmanaged dependencies are not required
    const unmanagedCount = [].concat.apply([], metadata).length;
    const dependencyCount = targets.length - unmanagedCount;
    if (dependencyCount > 0) {
        return dependencyCount;
    }
    else {
        return getBaseClassDependencyCount(metadataReader, baseConstructor);
    }
}
//# sourceMappingURL=reflection_utils.js.map