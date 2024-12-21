"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Binding = void 0;
const literal_types_1 = require("../constants/literal_types");
const id_1 = require("../utils/id");
class Binding {
    id;
    moduleId;
    // Determines weather the bindings has been already activated
    // The activation action takes place when an instance is resolved
    // If the scope is singleton it only happens once
    activated;
    // A runtime identifier because at runtime we don't have interfaces
    serviceIdentifier;
    // constructor from binding to or toConstructor
    implementationType;
    // Cache used to allow singleton scope and BindingType.ConstantValue bindings
    cache;
    // Cache used to allow BindingType.DynamicValue bindings
    dynamicValue;
    // The scope mode to be used
    scope;
    // The kind of binding
    type;
    // A factory method used in BindingType.Factory bindings
    factory;
    // An async factory method used in BindingType.Provider bindings
    provider;
    // A constraint used to limit the contexts in which this binding is applicable
    constraint;
    // On activation handler (invoked just before an instance is added to cache and injected)
    onActivation;
    // On deactivation handler (invoked just before an instance is unbinded and removed from container)
    onDeactivation;
    constructor(serviceIdentifier, scope) {
        this.id = (0, id_1.id)();
        this.activated = false;
        this.serviceIdentifier = serviceIdentifier;
        this.scope = scope;
        this.type = literal_types_1.BindingTypeEnum.Invalid;
        this.constraint = (_request) => true;
        this.implementationType = null;
        this.cache = null;
        this.factory = null;
        this.provider = null;
        this.onActivation = null;
        this.onDeactivation = null;
        this.dynamicValue = null;
    }
    clone() {
        const clone = new Binding(this.serviceIdentifier, this.scope);
        clone.activated =
            clone.scope === literal_types_1.BindingScopeEnum.Singleton ? this.activated : false;
        clone.implementationType = this.implementationType;
        clone.dynamicValue = this.dynamicValue;
        clone.scope = this.scope;
        clone.type = this.type;
        clone.factory = this.factory;
        clone.provider = this.provider;
        clone.constraint = this.constraint;
        clone.onActivation = this.onActivation;
        clone.onDeactivation = this.onDeactivation;
        clone.cache = this.cache;
        return clone;
    }
}
exports.Binding = Binding;
//# sourceMappingURL=binding.js.map