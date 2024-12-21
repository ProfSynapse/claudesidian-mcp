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
exports.multiBindToService = exports.getServiceIdentifierAsString = exports.typeConstraint = exports.namedConstraint = exports.taggedConstraint = exports.traverseAncerstors = exports.decorate = exports.id = exports.MetadataReader = exports.preDestroy = exports.postConstruct = exports.targetName = exports.multiInject = exports.unmanaged = exports.optional = exports.inject = exports.named = exports.tagged = exports.injectable = exports.createTaggedDecorator = exports.ContainerModule = exports.AsyncContainerModule = exports.TargetTypeEnum = exports.BindingTypeEnum = exports.BindingScopeEnum = exports.Container = exports.METADATA_KEY = exports.LazyServiceIdentifer = exports.LazyServiceIdentifier = void 0;
/* eslint-disable @typescript-eslint/naming-convention */
require("reflect-metadata");
const common_1 = require("@inversifyjs/common");
const keys = __importStar(require("./constants/metadata_keys"));
var common_2 = require("@inversifyjs/common");
Object.defineProperty(exports, "LazyServiceIdentifier", { enumerable: true, get: function () { return common_2.LazyServiceIdentifier; } });
/**
 * @deprecated Use LazyServiceIdentifier instead
 */
exports.LazyServiceIdentifer = common_1.LazyServiceIdentifier;
// eslint-disable-next-line @typescript-eslint/typedef
exports.METADATA_KEY = keys;
var container_1 = require("./container/container");
Object.defineProperty(exports, "Container", { enumerable: true, get: function () { return container_1.Container; } });
var literal_types_1 = require("./constants/literal_types");
Object.defineProperty(exports, "BindingScopeEnum", { enumerable: true, get: function () { return literal_types_1.BindingScopeEnum; } });
Object.defineProperty(exports, "BindingTypeEnum", { enumerable: true, get: function () { return literal_types_1.BindingTypeEnum; } });
Object.defineProperty(exports, "TargetTypeEnum", { enumerable: true, get: function () { return literal_types_1.TargetTypeEnum; } });
var container_module_1 = require("./container/container_module");
Object.defineProperty(exports, "AsyncContainerModule", { enumerable: true, get: function () { return container_module_1.AsyncContainerModule; } });
Object.defineProperty(exports, "ContainerModule", { enumerable: true, get: function () { return container_module_1.ContainerModule; } });
var decorator_utils_1 = require("./annotation/decorator_utils");
Object.defineProperty(exports, "createTaggedDecorator", { enumerable: true, get: function () { return decorator_utils_1.createTaggedDecorator; } });
var injectable_1 = require("./annotation/injectable");
Object.defineProperty(exports, "injectable", { enumerable: true, get: function () { return injectable_1.injectable; } });
var tagged_1 = require("./annotation/tagged");
Object.defineProperty(exports, "tagged", { enumerable: true, get: function () { return tagged_1.tagged; } });
var named_1 = require("./annotation/named");
Object.defineProperty(exports, "named", { enumerable: true, get: function () { return named_1.named; } });
var inject_1 = require("./annotation/inject");
Object.defineProperty(exports, "inject", { enumerable: true, get: function () { return inject_1.inject; } });
var optional_1 = require("./annotation/optional");
Object.defineProperty(exports, "optional", { enumerable: true, get: function () { return optional_1.optional; } });
var unmanaged_1 = require("./annotation/unmanaged");
Object.defineProperty(exports, "unmanaged", { enumerable: true, get: function () { return unmanaged_1.unmanaged; } });
var multi_inject_1 = require("./annotation/multi_inject");
Object.defineProperty(exports, "multiInject", { enumerable: true, get: function () { return multi_inject_1.multiInject; } });
var target_name_1 = require("./annotation/target_name");
Object.defineProperty(exports, "targetName", { enumerable: true, get: function () { return target_name_1.targetName; } });
var post_construct_1 = require("./annotation/post_construct");
Object.defineProperty(exports, "postConstruct", { enumerable: true, get: function () { return post_construct_1.postConstruct; } });
var pre_destroy_1 = require("./annotation/pre_destroy");
Object.defineProperty(exports, "preDestroy", { enumerable: true, get: function () { return pre_destroy_1.preDestroy; } });
var metadata_reader_1 = require("./planning/metadata_reader");
Object.defineProperty(exports, "MetadataReader", { enumerable: true, get: function () { return metadata_reader_1.MetadataReader; } });
var id_1 = require("./utils/id");
Object.defineProperty(exports, "id", { enumerable: true, get: function () { return id_1.id; } });
var decorator_utils_2 = require("./annotation/decorator_utils");
Object.defineProperty(exports, "decorate", { enumerable: true, get: function () { return decorator_utils_2.decorate; } });
var constraint_helpers_1 = require("./syntax/constraint_helpers");
Object.defineProperty(exports, "traverseAncerstors", { enumerable: true, get: function () { return constraint_helpers_1.traverseAncerstors; } });
Object.defineProperty(exports, "taggedConstraint", { enumerable: true, get: function () { return constraint_helpers_1.taggedConstraint; } });
Object.defineProperty(exports, "namedConstraint", { enumerable: true, get: function () { return constraint_helpers_1.namedConstraint; } });
Object.defineProperty(exports, "typeConstraint", { enumerable: true, get: function () { return constraint_helpers_1.typeConstraint; } });
var serialization_1 = require("./utils/serialization");
Object.defineProperty(exports, "getServiceIdentifierAsString", { enumerable: true, get: function () { return serialization_1.getServiceIdentifierAsString; } });
var binding_utils_1 = require("./utils/binding_utils");
Object.defineProperty(exports, "multiBindToService", { enumerable: true, get: function () { return binding_utils_1.multiBindToService; } });
//# sourceMappingURL=index.js.map