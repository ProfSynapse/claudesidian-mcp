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
exports.Container = void 0;
const binding_1 = require("../bindings/binding");
const ERROR_MSGS = __importStar(require("../constants/error_msgs"));
const literal_types_1 = require("../constants/literal_types");
const METADATA_KEY = __importStar(require("../constants/metadata_keys"));
const metadata_reader_1 = require("../planning/metadata_reader");
const planner_1 = require("../planning/planner");
const resolver_1 = require("../resolution/resolver");
const binding_to_syntax_1 = require("../syntax/binding_to_syntax");
const async_1 = require("../utils/async");
const id_1 = require("../utils/id");
const serialization_1 = require("../utils/serialization");
const container_snapshot_1 = require("./container_snapshot");
const lookup_1 = require("./lookup");
const module_activation_store_1 = require("./module_activation_store");
class Container {
    id;
    parent;
    options;
    _middleware;
    _bindingDictionary;
    _activations;
    _deactivations;
    _snapshots;
    _metadataReader;
    _moduleActivationStore;
    constructor(containerOptions) {
        const options = containerOptions || {};
        if (typeof options !== 'object') {
            throw new Error(ERROR_MSGS.CONTAINER_OPTIONS_MUST_BE_AN_OBJECT);
        }
        if (options.defaultScope === undefined) {
            options.defaultScope = literal_types_1.BindingScopeEnum.Transient;
        }
        else if (options.defaultScope !== literal_types_1.BindingScopeEnum.Singleton &&
            options.defaultScope !== literal_types_1.BindingScopeEnum.Transient &&
            options.defaultScope !== literal_types_1.BindingScopeEnum.Request) {
            throw new Error(ERROR_MSGS.CONTAINER_OPTIONS_INVALID_DEFAULT_SCOPE);
        }
        if (options.autoBindInjectable === undefined) {
            options.autoBindInjectable = false;
        }
        else if (typeof options.autoBindInjectable !== 'boolean') {
            throw new Error(ERROR_MSGS.CONTAINER_OPTIONS_INVALID_AUTO_BIND_INJECTABLE);
        }
        if (options.skipBaseClassChecks === undefined) {
            options.skipBaseClassChecks = false;
        }
        else if (typeof options.skipBaseClassChecks !== 'boolean') {
            throw new Error(ERROR_MSGS.CONTAINER_OPTIONS_INVALID_SKIP_BASE_CHECK);
        }
        this.options = {
            autoBindInjectable: options.autoBindInjectable,
            defaultScope: options.defaultScope,
            skipBaseClassChecks: options.skipBaseClassChecks,
        };
        this.id = (0, id_1.id)();
        this._bindingDictionary = new lookup_1.Lookup();
        this._snapshots = [];
        this._middleware = null;
        this._activations = new lookup_1.Lookup();
        this._deactivations = new lookup_1.Lookup();
        this.parent = null;
        this._metadataReader = new metadata_reader_1.MetadataReader();
        this._moduleActivationStore = new module_activation_store_1.ModuleActivationStore();
    }
    static merge(container1, container2, ...containers) {
        const container = new Container();
        const targetContainers = [
            container1,
            container2,
            ...containers,
        ].map((targetContainer) => (0, planner_1.getBindingDictionary)(targetContainer));
        const bindingDictionary = (0, planner_1.getBindingDictionary)(container);
        function copyDictionary(origin, destination) {
            origin.traverse((_key, value) => {
                value.forEach((binding) => {
                    destination.add(binding.serviceIdentifier, binding.clone());
                });
            });
        }
        targetContainers.forEach((targetBindingDictionary) => {
            copyDictionary(targetBindingDictionary, bindingDictionary);
        });
        return container;
    }
    load(...modules) {
        // eslint-disable-next-line @typescript-eslint/typedef
        const getHelpers = this._getContainerModuleHelpersFactory();
        for (const currentModule of modules) {
            // eslint-disable-next-line @typescript-eslint/typedef
            const containerModuleHelpers = getHelpers(currentModule.id);
            currentModule.registry(containerModuleHelpers.bindFunction, containerModuleHelpers.unbindFunction, containerModuleHelpers.isboundFunction, containerModuleHelpers.rebindFunction, containerModuleHelpers.unbindAsyncFunction, containerModuleHelpers.onActivationFunction, containerModuleHelpers.onDeactivationFunction);
        }
    }
    async loadAsync(...modules) {
        // eslint-disable-next-line @typescript-eslint/typedef
        const getHelpers = this._getContainerModuleHelpersFactory();
        for (const currentModule of modules) {
            // eslint-disable-next-line @typescript-eslint/typedef
            const containerModuleHelpers = getHelpers(currentModule.id);
            await currentModule.registry(containerModuleHelpers.bindFunction, containerModuleHelpers.unbindFunction, containerModuleHelpers.isboundFunction, containerModuleHelpers.rebindFunction, containerModuleHelpers.unbindAsyncFunction, containerModuleHelpers.onActivationFunction, containerModuleHelpers.onDeactivationFunction);
        }
    }
    unload(...modules) {
        modules.forEach((module) => {
            const deactivations = this._removeModuleBindings(module.id);
            this._deactivateSingletons(deactivations);
            this._removeModuleHandlers(module.id);
        });
    }
    async unloadAsync(...modules) {
        for (const module of modules) {
            const deactivations = this._removeModuleBindings(module.id);
            await this._deactivateSingletonsAsync(deactivations);
            this._removeModuleHandlers(module.id);
        }
    }
    // Registers a type binding
    bind(serviceIdentifier) {
        return this._bind(this._buildBinding(serviceIdentifier));
    }
    rebind(serviceIdentifier) {
        this.unbind(serviceIdentifier);
        return this.bind(serviceIdentifier);
    }
    async rebindAsync(serviceIdentifier) {
        await this.unbindAsync(serviceIdentifier);
        return this.bind(serviceIdentifier);
    }
    // Removes a type binding from the registry by its key
    unbind(serviceIdentifier) {
        if (this._bindingDictionary.hasKey(serviceIdentifier)) {
            const bindings = this._bindingDictionary.get(serviceIdentifier);
            this._deactivateSingletons(bindings);
        }
        this._removeServiceFromDictionary(serviceIdentifier);
    }
    async unbindAsync(serviceIdentifier) {
        if (this._bindingDictionary.hasKey(serviceIdentifier)) {
            const bindings = this._bindingDictionary.get(serviceIdentifier);
            await this._deactivateSingletonsAsync(bindings);
        }
        this._removeServiceFromDictionary(serviceIdentifier);
    }
    // Removes all the type bindings from the registry
    unbindAll() {
        this._bindingDictionary.traverse((_key, value) => {
            this._deactivateSingletons(value);
        });
        this._bindingDictionary = new lookup_1.Lookup();
    }
    async unbindAllAsync() {
        const promises = [];
        this._bindingDictionary.traverse((_key, value) => {
            promises.push(this._deactivateSingletonsAsync(value));
        });
        await Promise.all(promises);
        this._bindingDictionary = new lookup_1.Lookup();
    }
    onActivation(serviceIdentifier, onActivation) {
        this._activations.add(serviceIdentifier, onActivation);
    }
    onDeactivation(serviceIdentifier, onDeactivation) {
        this._deactivations.add(serviceIdentifier, onDeactivation);
    }
    // Allows to check if there are bindings available for serviceIdentifier
    isBound(serviceIdentifier) {
        let bound = this._bindingDictionary.hasKey(serviceIdentifier);
        if (!bound && this.parent) {
            bound = this.parent.isBound(serviceIdentifier);
        }
        return bound;
    }
    // check binding dependency only in current container
    isCurrentBound(serviceIdentifier) {
        return this._bindingDictionary.hasKey(serviceIdentifier);
    }
    isBoundNamed(serviceIdentifier, named) {
        return this.isBoundTagged(serviceIdentifier, METADATA_KEY.NAMED_TAG, named);
    }
    // Check if a binding with a complex constraint is available without throwing a error. Ancestors are also verified.
    isBoundTagged(serviceIdentifier, key, value) {
        let bound = false;
        // verify if there are bindings available for serviceIdentifier on current binding dictionary
        if (this._bindingDictionary.hasKey(serviceIdentifier)) {
            const bindings = this._bindingDictionary.get(serviceIdentifier);
            const request = (0, planner_1.createMockRequest)(this, serviceIdentifier, {
                customTag: {
                    key,
                    value,
                },
                isMultiInject: false,
            });
            bound = bindings.some((b) => b.constraint(request));
        }
        // verify if there is a parent container that could solve the request
        if (!bound && this.parent) {
            bound = this.parent.isBoundTagged(serviceIdentifier, key, value);
        }
        return bound;
    }
    snapshot() {
        this._snapshots.push(container_snapshot_1.ContainerSnapshot.of(this._bindingDictionary.clone(), this._middleware, this._activations.clone(), this._deactivations.clone(), this._moduleActivationStore.clone()));
    }
    restore() {
        const snapshot = this._snapshots.pop();
        if (snapshot === undefined) {
            throw new Error(ERROR_MSGS.NO_MORE_SNAPSHOTS_AVAILABLE);
        }
        this._bindingDictionary = snapshot.bindings;
        this._activations = snapshot.activations;
        this._deactivations = snapshot.deactivations;
        this._middleware = snapshot.middleware;
        this._moduleActivationStore = snapshot.moduleActivationStore;
    }
    createChild(containerOptions) {
        const child = new Container(containerOptions || this.options);
        child.parent = this;
        return child;
    }
    applyMiddleware(...middlewares) {
        const initial = this._middleware
            ? this._middleware
            : this._planAndResolve();
        this._middleware = middlewares.reduce((prev, curr) => curr(prev), initial);
    }
    applyCustomMetadataReader(metadataReader) {
        this._metadataReader = metadataReader;
    }
    // Resolves a dependency by its runtime identifier
    // The runtime identifier must be associated with only one binding
    // use getAll when the runtime identifier is associated with multiple bindings
    get(serviceIdentifier) {
        const getArgs = this._getNotAllArgs(serviceIdentifier, false, false);
        return this._getButThrowIfAsync(getArgs);
    }
    async getAsync(serviceIdentifier) {
        const getArgs = this._getNotAllArgs(serviceIdentifier, false, false);
        return this._get(getArgs);
    }
    getTagged(serviceIdentifier, key, value) {
        const getArgs = this._getNotAllArgs(serviceIdentifier, false, false, key, value);
        return this._getButThrowIfAsync(getArgs);
    }
    async getTaggedAsync(serviceIdentifier, key, value) {
        const getArgs = this._getNotAllArgs(serviceIdentifier, false, false, key, value);
        return this._get(getArgs);
    }
    getNamed(serviceIdentifier, named) {
        return this.getTagged(serviceIdentifier, METADATA_KEY.NAMED_TAG, named);
    }
    async getNamedAsync(serviceIdentifier, named) {
        return this.getTaggedAsync(serviceIdentifier, METADATA_KEY.NAMED_TAG, named);
    }
    // Resolves a dependency by its runtime identifier
    // The runtime identifier can be associated with one or multiple bindings
    getAll(serviceIdentifier, options) {
        const getArgs = this._getAllArgs(serviceIdentifier, options, false);
        return this._getButThrowIfAsync(getArgs);
    }
    async getAllAsync(serviceIdentifier, options) {
        const getArgs = this._getAllArgs(serviceIdentifier, options, false);
        return this._getAll(getArgs);
    }
    getAllTagged(serviceIdentifier, key, value) {
        const getArgs = this._getNotAllArgs(serviceIdentifier, true, false, key, value);
        return this._getButThrowIfAsync(getArgs);
    }
    async getAllTaggedAsync(serviceIdentifier, key, value) {
        const getArgs = this._getNotAllArgs(serviceIdentifier, true, false, key, value);
        return this._getAll(getArgs);
    }
    getAllNamed(serviceIdentifier, named) {
        return this.getAllTagged(serviceIdentifier, METADATA_KEY.NAMED_TAG, named);
    }
    async getAllNamedAsync(serviceIdentifier, named) {
        return this.getAllTaggedAsync(serviceIdentifier, METADATA_KEY.NAMED_TAG, named);
    }
    resolve(constructorFunction) {
        const isBound = this.isBound(constructorFunction);
        if (!isBound) {
            this.bind(constructorFunction).toSelf();
        }
        const resolved = this.get(constructorFunction);
        if (!isBound) {
            this.unbind(constructorFunction);
        }
        return resolved;
    }
    tryGet(serviceIdentifier) {
        const getArgs = this._getNotAllArgs(serviceIdentifier, false, true);
        return this._getButThrowIfAsync(getArgs);
    }
    async tryGetAsync(serviceIdentifier) {
        const getArgs = this._getNotAllArgs(serviceIdentifier, false, true);
        return this._get(getArgs);
    }
    tryGetTagged(serviceIdentifier, key, value) {
        const getArgs = this._getNotAllArgs(serviceIdentifier, false, true, key, value);
        return this._getButThrowIfAsync(getArgs);
    }
    async tryGetTaggedAsync(serviceIdentifier, key, value) {
        const getArgs = this._getNotAllArgs(serviceIdentifier, false, true, key, value);
        return this._get(getArgs);
    }
    tryGetNamed(serviceIdentifier, named) {
        return this.tryGetTagged(serviceIdentifier, METADATA_KEY.NAMED_TAG, named);
    }
    async tryGetNamedAsync(serviceIdentifier, named) {
        return this.tryGetTaggedAsync(serviceIdentifier, METADATA_KEY.NAMED_TAG, named);
    }
    tryGetAll(serviceIdentifier, options) {
        const getArgs = this._getAllArgs(serviceIdentifier, options, true);
        return this._getButThrowIfAsync(getArgs);
    }
    async tryGetAllAsync(serviceIdentifier, options) {
        const getArgs = this._getAllArgs(serviceIdentifier, options, true);
        return this._getAll(getArgs);
    }
    tryGetAllTagged(serviceIdentifier, key, value) {
        const getArgs = this._getNotAllArgs(serviceIdentifier, true, true, key, value);
        return this._getButThrowIfAsync(getArgs);
    }
    async tryGetAllTaggedAsync(serviceIdentifier, key, value) {
        const getArgs = this._getNotAllArgs(serviceIdentifier, true, true, key, value);
        return this._getAll(getArgs);
    }
    tryGetAllNamed(serviceIdentifier, named) {
        return this.tryGetAllTagged(serviceIdentifier, METADATA_KEY.NAMED_TAG, named);
    }
    async tryGetAllNamedAsync(serviceIdentifier, named) {
        return this.tryGetAllTaggedAsync(serviceIdentifier, METADATA_KEY.NAMED_TAG, named);
    }
    _preDestroy(constructor, instance) {
        if (constructor !== undefined &&
            Reflect.hasMetadata(METADATA_KEY.PRE_DESTROY, constructor)) {
            const data = Reflect.getMetadata(METADATA_KEY.PRE_DESTROY, constructor);
            return instance[data.value]?.();
        }
    }
    _removeModuleHandlers(moduleId) {
        const moduleActivationsHandlers = this._moduleActivationStore.remove(moduleId);
        this._activations.removeIntersection(moduleActivationsHandlers.onActivations);
        this._deactivations.removeIntersection(moduleActivationsHandlers.onDeactivations);
    }
    _removeModuleBindings(moduleId) {
        return this._bindingDictionary.removeByCondition((binding) => binding.moduleId === moduleId);
    }
    _deactivate(binding, instance) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const constructor = instance == undefined
            ? undefined
            : // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                Object.getPrototypeOf(instance).constructor;
        try {
            if (this._deactivations.hasKey(binding.serviceIdentifier)) {
                const result = this._deactivateContainer(instance, this._deactivations.get(binding.serviceIdentifier).values());
                if ((0, async_1.isPromise)(result)) {
                    return this._handleDeactivationError(result.then(async () => this._propagateContainerDeactivationThenBindingAndPreDestroyAsync(binding, instance, constructor)), binding.serviceIdentifier);
                }
            }
            const propagateDeactivationResult = this._propagateContainerDeactivationThenBindingAndPreDestroy(binding, instance, constructor);
            if ((0, async_1.isPromise)(propagateDeactivationResult)) {
                return this._handleDeactivationError(propagateDeactivationResult, binding.serviceIdentifier);
            }
        }
        catch (ex) {
            if (ex instanceof Error) {
                throw new Error(ERROR_MSGS.ON_DEACTIVATION_ERROR((0, serialization_1.getServiceIdentifierAsString)(binding.serviceIdentifier), ex.message));
            }
        }
    }
    async _handleDeactivationError(asyncResult, serviceIdentifier) {
        try {
            await asyncResult;
        }
        catch (ex) {
            if (ex instanceof Error) {
                throw new Error(ERROR_MSGS.ON_DEACTIVATION_ERROR((0, serialization_1.getServiceIdentifierAsString)(serviceIdentifier), ex.message));
            }
        }
    }
    _deactivateContainer(instance, deactivationsIterator) {
        let deactivation = deactivationsIterator.next();
        while (typeof deactivation.value === 'function') {
            const result = deactivation.value(instance);
            if ((0, async_1.isPromise)(result)) {
                return result.then(async () => this._deactivateContainerAsync(instance, deactivationsIterator));
            }
            deactivation = deactivationsIterator.next();
        }
    }
    async _deactivateContainerAsync(instance, deactivationsIterator) {
        let deactivation = deactivationsIterator.next();
        while (typeof deactivation.value === 'function') {
            await deactivation.value(instance);
            deactivation = deactivationsIterator.next();
        }
    }
    _getContainerModuleHelpersFactory() {
        const getBindFunction = (moduleId) => (serviceIdentifier) => {
            const binding = this._buildBinding(serviceIdentifier);
            binding.moduleId = moduleId;
            return this._bind(binding);
        };
        const getUnbindFunction = () => (serviceIdentifier) => {
            this.unbind(serviceIdentifier);
        };
        const getUnbindAsyncFunction = () => async (serviceIdentifier) => {
            return this.unbindAsync(serviceIdentifier);
        };
        const getIsboundFunction = () => (serviceIdentifier) => {
            return this.isBound(serviceIdentifier);
        };
        const getRebindFunction = (moduleId) => {
            const bind = getBindFunction(moduleId);
            return (serviceIdentifier) => {
                this.unbind(serviceIdentifier);
                return bind(serviceIdentifier);
            };
        };
        const getOnActivationFunction = (moduleId) => (serviceIdentifier, onActivation) => {
            this._moduleActivationStore.addActivation(moduleId, serviceIdentifier, onActivation);
            this.onActivation(serviceIdentifier, onActivation);
        };
        const getOnDeactivationFunction = (moduleId) => (serviceIdentifier, onDeactivation) => {
            this._moduleActivationStore.addDeactivation(moduleId, serviceIdentifier, onDeactivation);
            this.onDeactivation(serviceIdentifier, onDeactivation);
        };
        return (mId) => ({
            bindFunction: getBindFunction(mId),
            isboundFunction: getIsboundFunction(),
            onActivationFunction: getOnActivationFunction(mId),
            onDeactivationFunction: getOnDeactivationFunction(mId),
            rebindFunction: getRebindFunction(mId),
            unbindAsyncFunction: getUnbindAsyncFunction(),
            unbindFunction: getUnbindFunction(),
        });
    }
    _bind(binding) {
        this._bindingDictionary.add(binding.serviceIdentifier, binding);
        return new binding_to_syntax_1.BindingToSyntax(binding);
    }
    _buildBinding(serviceIdentifier) {
        const scope = this.options.defaultScope || literal_types_1.BindingScopeEnum.Transient;
        return new binding_1.Binding(serviceIdentifier, scope);
    }
    async _getAll(getArgs) {
        return Promise.all(this._get(getArgs));
    }
    // Prepares arguments required for resolution and
    // delegates resolution to _middleware if available
    // otherwise it delegates resolution to _planAndResolve
    _get(getArgs) {
        const planAndResolveArgs = {
            ...getArgs,
            contextInterceptor: (context) => context,
            targetType: literal_types_1.TargetTypeEnum.Variable,
        };
        if (this._middleware) {
            const middlewareResult = this._middleware(planAndResolveArgs);
            if (middlewareResult === undefined || middlewareResult === null) {
                throw new Error(ERROR_MSGS.INVALID_MIDDLEWARE_RETURN);
            }
            return middlewareResult;
        }
        return this._planAndResolve()(planAndResolveArgs);
    }
    _getButThrowIfAsync(getArgs) {
        const result = this._get(getArgs);
        if ((0, async_1.isPromiseOrContainsPromise)(result)) {
            throw new Error(ERROR_MSGS.LAZY_IN_SYNC(getArgs.serviceIdentifier));
        }
        return result;
    }
    _getAllArgs(serviceIdentifier, options, isOptional) {
        const getAllArgs = {
            avoidConstraints: !(options?.enforceBindingConstraints ?? false),
            isMultiInject: true,
            isOptional,
            serviceIdentifier,
        };
        return getAllArgs;
    }
    _getNotAllArgs(serviceIdentifier, isMultiInject, isOptional, key, value) {
        const getNotAllArgs = {
            avoidConstraints: false,
            isMultiInject,
            isOptional,
            key,
            serviceIdentifier,
            value,
        };
        return getNotAllArgs;
    }
    _getPlanMetadataFromNextArgs(args) {
        const planMetadata = {
            isMultiInject: args.isMultiInject,
        };
        if (args.key !== undefined) {
            planMetadata.customTag = {
                key: args.key,
                value: args.value,
            };
        }
        if (args.isOptional === true) {
            planMetadata.isOptional = true;
        }
        return planMetadata;
    }
    // Planner creates a plan and Resolver resolves a plan
    // one of the jobs of the Container is to links the Planner
    // with the Resolver and that is what this function is about
    _planAndResolve() {
        return (args) => {
            // create a plan
            let context = (0, planner_1.plan)(this._metadataReader, this, args.targetType, args.serviceIdentifier, this._getPlanMetadataFromNextArgs(args), args.avoidConstraints);
            // apply context interceptor
            context = args.contextInterceptor(context);
            // resolve plan
            const result = (0, resolver_1.resolve)(context);
            return result;
        };
    }
    _deactivateIfSingleton(binding) {
        if (!binding.activated) {
            return;
        }
        if ((0, async_1.isPromise)(binding.cache)) {
            return binding.cache.then((resolved) => this._deactivate(binding, resolved));
        }
        return this._deactivate(binding, binding.cache);
    }
    _deactivateSingletons(bindings) {
        for (const binding of bindings) {
            const result = this._deactivateIfSingleton(binding);
            if ((0, async_1.isPromise)(result)) {
                throw new Error(ERROR_MSGS.ASYNC_UNBIND_REQUIRED);
            }
        }
    }
    async _deactivateSingletonsAsync(bindings) {
        await Promise.all(bindings.map(async (b) => this._deactivateIfSingleton(b)));
    }
    _propagateContainerDeactivationThenBindingAndPreDestroy(binding, instance, constructor) {
        if (this.parent) {
            return this._deactivate.bind(this.parent)(binding, instance);
        }
        else {
            return this._bindingDeactivationAndPreDestroy(binding, instance, constructor);
        }
    }
    async _propagateContainerDeactivationThenBindingAndPreDestroyAsync(binding, instance, constructor) {
        if (this.parent) {
            await this._deactivate.bind(this.parent)(binding, instance);
        }
        else {
            await this._bindingDeactivationAndPreDestroyAsync(binding, instance, constructor);
        }
    }
    _removeServiceFromDictionary(serviceIdentifier) {
        try {
            this._bindingDictionary.remove(serviceIdentifier);
        }
        catch (_e) {
            throw new Error(`${ERROR_MSGS.CANNOT_UNBIND} ${(0, serialization_1.getServiceIdentifierAsString)(serviceIdentifier)}`);
        }
    }
    _bindingDeactivationAndPreDestroy(binding, instance, constructor) {
        if (typeof binding.onDeactivation === 'function') {
            const result = binding.onDeactivation(instance);
            if ((0, async_1.isPromise)(result)) {
                return result.then(() => this._preDestroy(constructor, instance));
            }
        }
        return this._preDestroy(constructor, instance);
    }
    async _bindingDeactivationAndPreDestroyAsync(binding, instance, constructor) {
        if (typeof binding.onDeactivation === 'function') {
            await binding.onDeactivation(instance);
        }
        await this._preDestroy(constructor, instance);
    }
}
exports.Container = Container;
//# sourceMappingURL=container.js.map