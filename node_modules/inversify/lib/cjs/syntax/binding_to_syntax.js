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
exports.BindingToSyntax = void 0;
const ERROR_MSGS = __importStar(require("../constants/error_msgs"));
const literal_types_1 = require("../constants/literal_types");
const binding_in_when_on_syntax_1 = require("./binding_in_when_on_syntax");
const binding_when_on_syntax_1 = require("./binding_when_on_syntax");
class BindingToSyntax {
    // TODO: Implement an internal type `_BindingToSyntax<T>` wherein this member
    // can be public. Let `BindingToSyntax<T>` be the presentational type that
    // depends on it, and does not expose this member as public.
    _binding;
    constructor(binding) {
        this._binding = binding;
    }
    to(constructor) {
        this._binding.type = literal_types_1.BindingTypeEnum.Instance;
        this._binding.implementationType = constructor;
        return new binding_in_when_on_syntax_1.BindingInWhenOnSyntax(this._binding);
    }
    toSelf() {
        if (typeof this._binding.serviceIdentifier !== 'function') {
            throw new Error(ERROR_MSGS.INVALID_TO_SELF_VALUE);
        }
        const self = this._binding
            .serviceIdentifier;
        return this.to(self);
    }
    toConstantValue(value) {
        this._binding.type = literal_types_1.BindingTypeEnum.ConstantValue;
        this._binding.cache = value;
        this._binding.dynamicValue = null;
        this._binding.implementationType = null;
        this._binding.scope = literal_types_1.BindingScopeEnum.Singleton;
        return new binding_when_on_syntax_1.BindingWhenOnSyntax(this._binding);
    }
    toDynamicValue(func) {
        this._binding.type = literal_types_1.BindingTypeEnum.DynamicValue;
        this._binding.cache = null;
        this._binding.dynamicValue = func;
        this._binding.implementationType = null;
        return new binding_in_when_on_syntax_1.BindingInWhenOnSyntax(this._binding);
    }
    toConstructor(constructor) {
        this._binding.type = literal_types_1.BindingTypeEnum.Constructor;
        this._binding.implementationType = constructor;
        this._binding.scope = literal_types_1.BindingScopeEnum.Singleton;
        return new binding_when_on_syntax_1.BindingWhenOnSyntax(this._binding);
    }
    toFactory(factory) {
        this._binding.type = literal_types_1.BindingTypeEnum.Factory;
        this._binding.factory = factory;
        this._binding.scope = literal_types_1.BindingScopeEnum.Singleton;
        return new binding_when_on_syntax_1.BindingWhenOnSyntax(this._binding);
    }
    toFunction(func) {
        // toFunction is an alias of toConstantValue
        if (typeof func !== 'function') {
            throw new Error(ERROR_MSGS.INVALID_FUNCTION_BINDING);
        }
        const bindingWhenOnSyntax = this.toConstantValue(func);
        this._binding.type = literal_types_1.BindingTypeEnum.Function;
        this._binding.scope = literal_types_1.BindingScopeEnum.Singleton;
        return bindingWhenOnSyntax;
    }
    toAutoFactory(serviceIdentifier) {
        this._binding.type = literal_types_1.BindingTypeEnum.Factory;
        this._binding.factory = (context) => {
            const autofactory = () => context.container.get(serviceIdentifier);
            return autofactory;
        };
        this._binding.scope = literal_types_1.BindingScopeEnum.Singleton;
        return new binding_when_on_syntax_1.BindingWhenOnSyntax(this._binding);
    }
    toAutoNamedFactory(serviceIdentifier) {
        this._binding.type = literal_types_1.BindingTypeEnum.Factory;
        this._binding.factory = (context) => {
            return (named) => context.container.getNamed(serviceIdentifier, named);
        };
        return new binding_when_on_syntax_1.BindingWhenOnSyntax(this._binding);
    }
    toProvider(provider) {
        this._binding.type = literal_types_1.BindingTypeEnum.Provider;
        this._binding.provider = provider;
        this._binding.scope = literal_types_1.BindingScopeEnum.Singleton;
        return new binding_when_on_syntax_1.BindingWhenOnSyntax(this._binding);
    }
    toService(service) {
        this._binding.type = literal_types_1.BindingTypeEnum.DynamicValue;
        // Service bindings should never ever be cached. This is just a workaround to achieve that. A better design should replace this approach.
        Object.defineProperty(this._binding, 'cache', {
            configurable: true,
            enumerable: true,
            get() {
                return null;
            },
            set(_value) { },
        });
        this._binding.dynamicValue = (context) => {
            try {
                return context.container.get(service);
            }
            catch (_error) {
                // This is a performance degradation in this edge case, we do need to improve the internal resolution architecture in order to solve this properly.
                return context.container.getAsync(service);
            }
        };
        this._binding.implementationType = null;
    }
}
exports.BindingToSyntax = BindingToSyntax;
//# sourceMappingURL=binding_to_syntax.js.map