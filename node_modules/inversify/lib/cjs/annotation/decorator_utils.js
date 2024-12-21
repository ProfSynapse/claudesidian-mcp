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
exports.decorate = decorate;
exports.tagParameter = tagParameter;
exports.tagProperty = tagProperty;
exports.createTaggedDecorator = createTaggedDecorator;
const ERROR_MSGS = __importStar(require("../constants/error_msgs"));
const METADATA_KEY = __importStar(require("../constants/metadata_keys"));
const js_1 = require("../utils/js");
function targetIsConstructorFunction(target) {
    return target.prototype !== undefined;
}
function _throwIfMethodParameter(parameterName) {
    if (parameterName !== undefined) {
        throw new Error(ERROR_MSGS.INVALID_DECORATOR_OPERATION);
    }
}
function tagParameter(annotationTarget, parameterName, parameterIndex, metadata) {
    _throwIfMethodParameter(parameterName);
    _tagParameterOrProperty(METADATA_KEY.TAGGED, annotationTarget, parameterIndex.toString(), metadata);
}
function tagProperty(annotationTarget, propertyName, metadata) {
    if (targetIsConstructorFunction(annotationTarget)) {
        throw new Error(ERROR_MSGS.INVALID_DECORATOR_OPERATION);
    }
    _tagParameterOrProperty(METADATA_KEY.TAGGED_PROP, annotationTarget.constructor, propertyName, metadata);
}
function _ensureNoMetadataKeyDuplicates(metadata) {
    let metadatas = [];
    if (Array.isArray(metadata)) {
        metadatas = metadata;
        const duplicate = (0, js_1.getFirstArrayDuplicate)(metadatas.map((md) => md.key));
        if (duplicate !== undefined) {
            throw new Error(`${ERROR_MSGS.DUPLICATED_METADATA} ${duplicate.toString()}`);
        }
    }
    else {
        metadatas = [metadata];
    }
    return metadatas;
}
function _tagParameterOrProperty(metadataKey, annotationTarget, key, metadata) {
    const metadatas = _ensureNoMetadataKeyDuplicates(metadata);
    let paramsOrPropertiesMetadata = {};
    // read metadata if available
    if (Reflect.hasOwnMetadata(metadataKey, annotationTarget)) {
        paramsOrPropertiesMetadata = Reflect.getMetadata(metadataKey, annotationTarget);
    }
    let paramOrPropertyMetadata = paramsOrPropertiesMetadata[key];
    if (paramOrPropertyMetadata === undefined) {
        paramOrPropertyMetadata = [];
    }
    else {
        for (const m of paramOrPropertyMetadata) {
            if (metadatas.some((md) => md.key === m.key)) {
                throw new Error(`${ERROR_MSGS.DUPLICATED_METADATA} ${m.key.toString()}`);
            }
        }
    }
    // set metadata
    paramOrPropertyMetadata.push(...metadatas);
    paramsOrPropertiesMetadata[key] = paramOrPropertyMetadata;
    Reflect.defineMetadata(metadataKey, paramsOrPropertiesMetadata, annotationTarget);
}
function createTaggedDecorator(metadata) {
    return (target, targetKey, indexOrPropertyDescriptor) => {
        if (typeof indexOrPropertyDescriptor === 'number') {
            tagParameter(target, targetKey, indexOrPropertyDescriptor, metadata);
        }
        else {
            tagProperty(target, targetKey, metadata);
        }
    };
}
function _decorate(decorators, target) {
    Reflect.decorate(decorators, target);
}
function _param(paramIndex, decorator) {
    return function (target, key) {
        decorator(target, key, paramIndex);
    };
}
// Allows VanillaJS developers to use decorators:
// decorate(injectable(), FooBar);
// decorate(targetName('foo', 'bar'), FooBar);
// decorate(named('foo'), FooBar, 0);
// decorate(tagged('bar'), FooBar, 1);
function decorate(decorator, target, parameterIndexOrProperty) {
    if (typeof parameterIndexOrProperty === 'number') {
        _decorate([_param(parameterIndexOrProperty, decorator)], target);
    }
    else if (typeof parameterIndexOrProperty === 'string') {
        Reflect.decorate([decorator], target, parameterIndexOrProperty);
    }
    else {
        _decorate([decorator], target);
    }
}
//# sourceMappingURL=decorator_utils.js.map