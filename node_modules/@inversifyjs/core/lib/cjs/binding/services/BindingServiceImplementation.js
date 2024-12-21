"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BindingServiceImplementation = void 0;
class BindingServiceImplementation {
    #idToBindingMap;
    #moduleIdToIdToBindingMap;
    constructor() {
        this.#idToBindingMap = new Map();
        this.#moduleIdToIdToBindingMap = new Map();
    }
    get(serviceIdentifier) {
        return this.#idToBindingMap.get(serviceIdentifier);
    }
    remove(serviceIdentifier) {
        const serviceBindings = this.#idToBindingMap.get(serviceIdentifier);
        this.#idToBindingMap.delete(serviceIdentifier);
        if (serviceBindings !== undefined) {
            this.#removeBindingsFromModuleMap(serviceBindings);
        }
    }
    removeByModule(moduleId) {
        const moduleBindings = this.#moduleIdToIdToBindingMap.get(moduleId);
        if (moduleBindings === undefined) {
            return;
        }
        this.#moduleIdToIdToBindingMap.delete(moduleId);
        this.#removeBindingsFromIdMap(moduleBindings.values());
    }
    set(binding) {
        this.#setIdToBindingMapBinding(binding);
        this.#setModuleIdToIdToBindingMapBinding(binding);
    }
    #removeBindingsFromIdMap(bindings) {
        for (const binding of bindings) {
            let serviceBindings = this.#idToBindingMap.get(binding.serviceIdentifier);
            if (serviceBindings !== undefined) {
                serviceBindings = serviceBindings.filter((serviceBinding) => serviceBinding.id !== binding.id);
                if (serviceBindings.length === 0) {
                    this.#idToBindingMap.delete(binding.serviceIdentifier);
                }
                else {
                    this.#idToBindingMap.set(binding.serviceIdentifier, serviceBindings);
                }
            }
        }
    }
    #removeBindingsFromModuleMap(bindings) {
        for (const binding of bindings) {
            if (binding.moduleId !== undefined) {
                const moduleBindings = this.#moduleIdToIdToBindingMap.get(binding.moduleId);
                if (moduleBindings !== undefined) {
                    moduleBindings.delete(binding.id);
                    if (moduleBindings.size === 0) {
                        this.#moduleIdToIdToBindingMap.delete(binding.moduleId);
                    }
                }
            }
        }
    }
    #setIdToBindingMapBinding(binding) {
        let serviceBindings = this.#idToBindingMap.get(binding.serviceIdentifier);
        if (serviceBindings === undefined) {
            serviceBindings = [];
        }
        serviceBindings.push(binding);
        this.#idToBindingMap.set(binding.serviceIdentifier, serviceBindings);
    }
    #setModuleIdToIdToBindingMapBinding(binding) {
        if (binding.moduleId === undefined) {
            return;
        }
        let moduleBindingsMap = this.#moduleIdToIdToBindingMap.get(binding.moduleId);
        if (moduleBindingsMap === undefined) {
            moduleBindingsMap = new Map();
            this.#moduleIdToIdToBindingMap.set(binding.moduleId, moduleBindingsMap);
        }
        moduleBindingsMap.set(binding.id, binding);
    }
}
exports.BindingServiceImplementation = BindingServiceImplementation;
//# sourceMappingURL=BindingServiceImplementation.js.map