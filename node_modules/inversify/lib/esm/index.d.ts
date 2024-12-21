import { Newable, ServiceIdentifier, LazyServiceIdentifier } from '@inversifyjs/common';
export { LazyServiceIdentifier } from '@inversifyjs/common';
import { LegacyTarget } from '@inversifyjs/core';

declare const NAMED_TAG: string;
declare const NAME_TAG: string;
declare const UNMANAGED_TAG: string;
declare const OPTIONAL_TAG: string;
declare const INJECT_TAG: string;
declare const MULTI_INJECT_TAG: string;
declare const TAGGED: string;
declare const TAGGED_PROP: string;
declare const PARAM_TYPES: string;
declare const DESIGN_PARAM_TYPES: string;
declare const POST_CONSTRUCT: string;
declare const PRE_DESTROY: string;
declare const NON_CUSTOM_TAG_KEYS: string[];

declare const keys_DESIGN_PARAM_TYPES: typeof DESIGN_PARAM_TYPES;
declare const keys_INJECT_TAG: typeof INJECT_TAG;
declare const keys_MULTI_INJECT_TAG: typeof MULTI_INJECT_TAG;
declare const keys_NAMED_TAG: typeof NAMED_TAG;
declare const keys_NAME_TAG: typeof NAME_TAG;
declare const keys_NON_CUSTOM_TAG_KEYS: typeof NON_CUSTOM_TAG_KEYS;
declare const keys_OPTIONAL_TAG: typeof OPTIONAL_TAG;
declare const keys_PARAM_TYPES: typeof PARAM_TYPES;
declare const keys_POST_CONSTRUCT: typeof POST_CONSTRUCT;
declare const keys_PRE_DESTROY: typeof PRE_DESTROY;
declare const keys_TAGGED: typeof TAGGED;
declare const keys_TAGGED_PROP: typeof TAGGED_PROP;
declare const keys_UNMANAGED_TAG: typeof UNMANAGED_TAG;
declare namespace keys {
  export { keys_DESIGN_PARAM_TYPES as DESIGN_PARAM_TYPES, keys_INJECT_TAG as INJECT_TAG, keys_MULTI_INJECT_TAG as MULTI_INJECT_TAG, keys_NAMED_TAG as NAMED_TAG, keys_NAME_TAG as NAME_TAG, keys_NON_CUSTOM_TAG_KEYS as NON_CUSTOM_TAG_KEYS, keys_OPTIONAL_TAG as OPTIONAL_TAG, keys_PARAM_TYPES as PARAM_TYPES, keys_POST_CONSTRUCT as POST_CONSTRUCT, keys_PRE_DESTROY as PRE_DESTROY, keys_TAGGED as TAGGED, keys_TAGGED_PROP as TAGGED_PROP, keys_UNMANAGED_TAG as UNMANAGED_TAG };
}

declare enum FactoryType {
    DynamicValue = "toDynamicValue",
    Factory = "toFactory",
    Provider = "toProvider"
}

type CommonNewable<TInstance = unknown, TArgs extends unknown[] = any[]> = Newable<TInstance, TArgs>;
type CommonServiceIdentifier<TInstance = unknown> = ServiceIdentifier<TInstance>;

declare namespace interfaces {
    export type DynamicValue<T> = (context: interfaces.Context) => T | Promise<T>;
    export type ContainerResolution<T> = undefined | T | Promise<T> | (T | Promise<T>)[];
    type AsyncCallback<TCallback> = TCallback extends (...args: infer TArgs) => infer TResult ? (...args: TArgs) => Promise<TResult> : never;
    export type BindingScope = 'Singleton' | 'Transient' | 'Request';
    export type BindingType = 'ConstantValue' | 'Constructor' | 'DynamicValue' | 'Factory' | 'Function' | 'Instance' | 'Invalid' | 'Provider';
    export type TargetType = 'ConstructorArgument' | 'ClassProperty' | 'Variable';
    export interface BindingScopeEnum {
        Request: interfaces.BindingScope;
        Singleton: interfaces.BindingScope;
        Transient: interfaces.BindingScope;
    }
    export interface BindingTypeEnum {
        ConstantValue: interfaces.BindingType;
        Constructor: interfaces.BindingType;
        DynamicValue: interfaces.BindingType;
        Factory: interfaces.BindingType;
        Function: interfaces.BindingType;
        Instance: interfaces.BindingType;
        Invalid: interfaces.BindingType;
        Provider: interfaces.BindingType;
    }
    export interface TargetTypeEnum {
        ConstructorArgument: interfaces.TargetType;
        ClassProperty: interfaces.TargetType;
        Variable: interfaces.TargetType;
    }
    export type Newable<TInstance = unknown> = CommonNewable<TInstance>;
    export type Instance<T> = T & Record<string, () => void>;
    export interface Abstract<T> {
        prototype: T;
    }
    export type ServiceIdentifier<T = unknown> = CommonServiceIdentifier<T>;
    export interface Clonable<T> {
        clone(): T;
    }
    export type BindingActivation<T = unknown> = (context: interfaces.Context, injectable: T) => T | Promise<T>;
    export type BindingDeactivation<T = unknown> = (injectable: T) => void | Promise<void>;
    export interface Binding<TActivated = unknown> extends Clonable<Binding<TActivated>> {
        id: number;
        moduleId: ContainerModuleBase['id'];
        activated: boolean;
        serviceIdentifier: ServiceIdentifier<TActivated>;
        constraint: ConstraintFunction;
        dynamicValue: DynamicValue<TActivated> | null;
        scope: BindingScope;
        type: BindingType;
        implementationType: Newable<TActivated> | TActivated | null;
        factory: FactoryCreator<unknown> | null;
        provider: ProviderCreator<unknown> | null;
        onActivation: BindingActivation<TActivated> | null;
        onDeactivation: BindingDeactivation<TActivated> | null;
        cache: null | TActivated | Promise<TActivated>;
    }
    export type SimpleFactory<T, U extends unknown[] = unknown[]> = (...args: U) => T;
    export type MultiFactory<T, U extends unknown[] = unknown[], V extends unknown[] = unknown[]> = (...args: U) => SimpleFactory<T, V>;
    export type Factory<T, U extends unknown[] = unknown[], V extends unknown[] = unknown[]> = SimpleFactory<T, U> | MultiFactory<T, U, V>;
    export type FactoryCreator<T, U extends unknown[] = unknown[], V extends unknown[] = unknown[]> = (context: Context) => Factory<T, U, V>;
    export type AutoNamedFactory<T> = SimpleFactory<T, [string]>;
    export type AutoFactory<T> = SimpleFactory<T, []>;
    export type FactoryTypeFunction<T = unknown> = (context: interfaces.Context) => T | Promise<T>;
    export interface FactoryDetails {
        factoryType: FactoryType;
        factory: FactoryTypeFunction | null;
    }
    export type Provider<T> = (...args: any[]) => ((...args: any[]) => Promise<T>) | Promise<T>;
    export type ProviderCreator<T> = (context: Context) => Provider<T>;
    export interface NextArgs<T = unknown> {
        avoidConstraints: boolean;
        contextInterceptor: (contexts: Context) => Context;
        isMultiInject: boolean;
        isOptional?: boolean;
        targetType: TargetType;
        serviceIdentifier: interfaces.ServiceIdentifier<T>;
        key?: string | number | symbol | undefined;
        value?: unknown;
    }
    export type Next = (args: NextArgs) => unknown | unknown[];
    export type Middleware = (next: Next) => Next;
    export type ContextInterceptor = (context: interfaces.Context) => interfaces.Context;
    export interface Context {
        id: number;
        container: Container;
        plan: Plan;
        currentRequest: Request;
        addPlan(plan: Plan): void;
        setCurrentRequest(request: Request): void;
    }
    export type MetadataOrMetadataArray = Metadata | Metadata[];
    export interface Metadata<TValue = unknown> {
        key: string | number | symbol;
        value: TValue;
    }
    export interface Plan {
        parentContext: Context;
        rootRequest: Request;
    }
    export interface QueryableString {
        startsWith(searchString: string): boolean;
        endsWith(searchString: string): boolean;
        contains(searchString: string): boolean;
        equals(compareString: string): boolean;
        value(): string;
    }
    export type ResolveRequestHandler = (request: interfaces.Request) => unknown;
    export type RequestScope = Map<unknown, unknown>;
    export interface Request {
        id: number;
        serviceIdentifier: ServiceIdentifier;
        parentContext: Context;
        parentRequest: Request | null;
        childRequests: Request[];
        target: Target;
        bindings: Binding<unknown>[];
        requestScope: RequestScope | null;
        addChildRequest(serviceIdentifier: ServiceIdentifier, bindings: Binding<unknown> | Binding<unknown>[], target: Target): Request;
    }
    export type Target = LegacyTarget;
    export interface ContainerOptions {
        autoBindInjectable?: boolean;
        defaultScope?: BindingScope | undefined;
        skipBaseClassChecks?: boolean;
    }
    export interface GetAllOptions {
        enforceBindingConstraints?: boolean;
    }
    export interface Container {
        id: number;
        parent: Container | null;
        options: ContainerOptions;
        bind<T>(serviceIdentifier: ServiceIdentifier<T>): BindingToSyntax<T>;
        rebind<T>(serviceIdentifier: interfaces.ServiceIdentifier<T>): interfaces.BindingToSyntax<T>;
        rebindAsync<T>(serviceIdentifier: interfaces.ServiceIdentifier<T>): Promise<interfaces.BindingToSyntax<T>>;
        unbind(serviceIdentifier: ServiceIdentifier): void;
        unbindAsync(serviceIdentifier: interfaces.ServiceIdentifier): Promise<void>;
        unbindAll(): void;
        unbindAllAsync(): Promise<void>;
        isBound(serviceIdentifier: ServiceIdentifier): boolean;
        isCurrentBound<T>(serviceIdentifier: ServiceIdentifier<T>): boolean;
        isBoundNamed(serviceIdentifier: ServiceIdentifier, named: string | number | symbol): boolean;
        isBoundTagged(serviceIdentifier: ServiceIdentifier, key: string | number | symbol, value: unknown): boolean;
        get<T>(serviceIdentifier: ServiceIdentifier<T>): T;
        getNamed<T>(serviceIdentifier: ServiceIdentifier<T>, named: string | number | symbol): T;
        getTagged<T>(serviceIdentifier: ServiceIdentifier<T>, key: string | number | symbol, value: unknown): T;
        getAll<T>(serviceIdentifier: ServiceIdentifier<T>, options?: GetAllOptions): T[];
        getAllTagged<T>(serviceIdentifier: ServiceIdentifier<T>, key: string | number | symbol, value: unknown): T[];
        getAllNamed<T>(serviceIdentifier: ServiceIdentifier<T>, named: string | number | symbol): T[];
        getAsync<T>(serviceIdentifier: ServiceIdentifier<T>): Promise<T>;
        getNamedAsync<T>(serviceIdentifier: ServiceIdentifier<T>, named: string | number | symbol): Promise<T>;
        getTaggedAsync<T>(serviceIdentifier: ServiceIdentifier<T>, key: string | number | symbol, value: unknown): Promise<T>;
        getAllAsync<T>(serviceIdentifier: ServiceIdentifier<T>, options?: GetAllOptions): Promise<T[]>;
        getAllTaggedAsync<T>(serviceIdentifier: ServiceIdentifier<T>, key: string | number | symbol, value: unknown): Promise<T[]>;
        getAllNamedAsync<T>(serviceIdentifier: ServiceIdentifier<T>, named: string | number | symbol): Promise<T[]>;
        onActivation<T>(serviceIdentifier: ServiceIdentifier<T>, onActivation: BindingActivation<T>): void;
        onDeactivation<T>(serviceIdentifier: ServiceIdentifier<T>, onDeactivation: BindingDeactivation<T>): void;
        resolve<T>(constructorFunction: interfaces.Newable<T>): T;
        tryGet<T>(serviceIdentifier: interfaces.ServiceIdentifier<T>): T | undefined;
        tryGetAsync<T>(serviceIdentifier: interfaces.ServiceIdentifier<T>): Promise<T | undefined>;
        tryGetTagged<T>(serviceIdentifier: interfaces.ServiceIdentifier<T>, key: string | number | symbol, value: unknown): T | undefined;
        tryGetTaggedAsync<T>(serviceIdentifier: interfaces.ServiceIdentifier<T>, key: string | number | symbol, value: unknown): Promise<T | undefined>;
        tryGetNamed<T>(serviceIdentifier: interfaces.ServiceIdentifier<T>, named: string | number | symbol): T | undefined;
        tryGetNamedAsync<T>(serviceIdentifier: interfaces.ServiceIdentifier<T>, named: string | number | symbol): Promise<T | undefined>;
        tryGetAll<T>(serviceIdentifier: interfaces.ServiceIdentifier<T>, options?: interfaces.GetAllOptions): T[];
        tryGetAllAsync<T>(serviceIdentifier: interfaces.ServiceIdentifier<T>, options?: interfaces.GetAllOptions): Promise<T[]>;
        tryGetAllTagged<T>(serviceIdentifier: interfaces.ServiceIdentifier<T>, key: string | number | symbol, value: unknown): T[];
        tryGetAllTaggedAsync<T>(serviceIdentifier: interfaces.ServiceIdentifier<T>, key: string | number | symbol, value: unknown): Promise<T[]>;
        tryGetAllNamed<T>(serviceIdentifier: interfaces.ServiceIdentifier<T>, named: string | number | symbol): T[];
        tryGetAllNamedAsync<T>(serviceIdentifier: interfaces.ServiceIdentifier<T>, named: string | number | symbol): Promise<T[]>;
        load(...modules: ContainerModule[]): void;
        loadAsync(...modules: AsyncContainerModule[]): Promise<void>;
        unload(...modules: ContainerModuleBase[]): void;
        unloadAsync(...modules: ContainerModuleBase[]): Promise<void>;
        applyCustomMetadataReader(metadataReader: MetadataReader): void;
        applyMiddleware(...middleware: Middleware[]): void;
        snapshot(): void;
        restore(): void;
        createChild(): Container;
    }
    export type Bind = <T = unknown>(serviceIdentifier: ServiceIdentifier<T>) => BindingToSyntax<T>;
    export type Rebind = <T = unknown>(serviceIdentifier: ServiceIdentifier<T>) => BindingToSyntax<T>;
    export type Unbind = <T = unknown>(serviceIdentifier: ServiceIdentifier<T>) => void;
    export type UnbindAsync = <T = unknown>(serviceIdentifier: ServiceIdentifier<T>) => Promise<void>;
    export type IsBound = <T = unknown>(serviceIdentifier: ServiceIdentifier<T>) => boolean;
    export interface ContainerModuleBase {
        id: number;
    }
    export interface ContainerModule extends ContainerModuleBase {
        registry: ContainerModuleCallBack;
    }
    export interface AsyncContainerModule extends ContainerModuleBase {
        registry: AsyncContainerModuleCallBack;
    }
    export interface ModuleActivationHandlers {
        onActivations: Lookup<BindingActivation<unknown>>;
        onDeactivations: Lookup<BindingDeactivation<unknown>>;
    }
    export interface ModuleActivationStore extends Clonable<ModuleActivationStore> {
        addDeactivation<T>(moduleId: ContainerModuleBase['id'], serviceIdentifier: ServiceIdentifier<T>, onDeactivation: interfaces.BindingDeactivation<T>): void;
        addActivation<T>(moduleId: ContainerModuleBase['id'], serviceIdentifier: ServiceIdentifier<T>, onActivation: interfaces.BindingActivation<T>): void;
        remove(moduleId: ContainerModuleBase['id']): ModuleActivationHandlers;
    }
    export type ContainerModuleCallBack = (bind: interfaces.Bind, unbind: interfaces.Unbind, isBound: interfaces.IsBound, rebind: interfaces.Rebind, unbindAsync: interfaces.UnbindAsync, onActivation: interfaces.Container['onActivation'], onDeactivation: interfaces.Container['onDeactivation']) => void;
    export type AsyncContainerModuleCallBack = AsyncCallback<ContainerModuleCallBack>;
    export interface ContainerSnapshot {
        bindings: Lookup<Binding<unknown>>;
        activations: Lookup<BindingActivation<unknown>>;
        deactivations: Lookup<BindingDeactivation<unknown>>;
        middleware: Next | null;
        moduleActivationStore: interfaces.ModuleActivationStore;
    }
    export interface Lookup<T> extends Clonable<Lookup<T>> {
        add(serviceIdentifier: ServiceIdentifier, value: T): void;
        getMap(): Map<interfaces.ServiceIdentifier, T[]>;
        get(serviceIdentifier: ServiceIdentifier): T[];
        remove(serviceIdentifier: interfaces.ServiceIdentifier): void;
        removeByCondition(condition: (item: T) => boolean): T[];
        removeIntersection(lookup: interfaces.Lookup<T>): void;
        hasKey(serviceIdentifier: ServiceIdentifier): boolean;
        clone(): Lookup<T>;
        traverse(func: (key: interfaces.ServiceIdentifier, value: T[]) => void): void;
    }
    export interface BindingOnSyntax<T> {
        onActivation(fn: (context: Context, injectable: T) => T | Promise<T>): BindingWhenSyntax<T>;
        onDeactivation(fn: (injectable: T) => void | Promise<void>): BindingWhenSyntax<T>;
    }
    export interface BindingWhenSyntax<T> {
        when(constraint: (request: Request) => boolean): BindingOnSyntax<T>;
        whenTargetNamed(name: string | number | symbol): BindingOnSyntax<T>;
        whenTargetIsDefault(): BindingOnSyntax<T>;
        whenTargetTagged(tag: string | number | symbol, value: unknown): BindingOnSyntax<T>;
        whenInjectedInto(parent: NewableFunction | string): BindingOnSyntax<T>;
        whenParentNamed(name: string | number | symbol): BindingOnSyntax<T>;
        whenParentTagged(tag: string | number | symbol, value: unknown): BindingOnSyntax<T>;
        whenAnyAncestorIs(ancestor: NewableFunction | string): BindingOnSyntax<T>;
        whenNoAncestorIs(ancestor: NewableFunction | string): BindingOnSyntax<T>;
        whenAnyAncestorNamed(name: string | number | symbol): BindingOnSyntax<T>;
        whenAnyAncestorTagged(tag: string | number | symbol, value: unknown): BindingOnSyntax<T>;
        whenNoAncestorNamed(name: string | number | symbol): BindingOnSyntax<T>;
        whenNoAncestorTagged(tag: string | number | symbol, value: unknown): BindingOnSyntax<T>;
        whenAnyAncestorMatches(constraint: (request: Request) => boolean): BindingOnSyntax<T>;
        whenNoAncestorMatches(constraint: (request: Request) => boolean): BindingOnSyntax<T>;
    }
    export interface BindingWhenOnSyntax<T> extends BindingWhenSyntax<T>, BindingOnSyntax<T> {
    }
    export interface BindingInSyntax<T> {
        inSingletonScope(): BindingWhenOnSyntax<T>;
        inTransientScope(): BindingWhenOnSyntax<T>;
        inRequestScope(): BindingWhenOnSyntax<T>;
    }
    export interface BindingInWhenOnSyntax<T> extends BindingInSyntax<T>, BindingWhenOnSyntax<T> {
    }
    export interface BindingToSyntax<T> {
        to(constructor: Newable<T>): BindingInWhenOnSyntax<T>;
        toSelf(): BindingInWhenOnSyntax<T>;
        toConstantValue(value: T): BindingWhenOnSyntax<T>;
        toDynamicValue(func: DynamicValue<T>): BindingInWhenOnSyntax<T>;
        toConstructor<T2>(constructor: Newable<T2>): BindingWhenOnSyntax<T>;
        toFactory<T2, T3 extends unknown[] = unknown[], T4 extends unknown[] = unknown[]>(factory: FactoryCreator<T2, T3, T4>): BindingWhenOnSyntax<T>;
        toFunction(func: T): BindingWhenOnSyntax<T>;
        toAutoFactory<T2>(serviceIdentifier: ServiceIdentifier<T2>): BindingWhenOnSyntax<T>;
        toAutoNamedFactory<T2>(serviceIdentifier: ServiceIdentifier<T2>): BindingWhenOnSyntax<T>;
        toProvider<T2>(provider: ProviderCreator<T2>): BindingWhenOnSyntax<T>;
        toService(service: ServiceIdentifier<T>): void;
    }
    export interface ConstraintFunction {
        (request: Request | null): boolean;
        metaData?: Metadata;
    }
    export interface MetadataReader {
        getConstructorMetadata(constructorFunc: NewableFunction): ConstructorMetadata;
        getPropertiesMetadata(constructorFunc: NewableFunction): MetadataMap;
    }
    export interface MetadataMap {
        [propertyNameOrArgumentIndex: string | symbol]: Metadata[];
    }
    export interface ConstructorMetadata {
        compilerGeneratedMetadata: NewableFunction[] | undefined;
        userGeneratedMetadata: MetadataMap;
    }
    export {  };
}
//# sourceMappingURL=interfaces.d.ts.map

declare class Container implements interfaces.Container {
    id: number;
    parent: interfaces.Container | null;
    readonly options: interfaces.ContainerOptions;
    private _middleware;
    private _bindingDictionary;
    private _activations;
    private _deactivations;
    private readonly _snapshots;
    private _metadataReader;
    private _moduleActivationStore;
    constructor(containerOptions?: interfaces.ContainerOptions);
    static merge(container1: interfaces.Container, container2: interfaces.Container, ...containers: interfaces.Container[]): interfaces.Container;
    load(...modules: interfaces.ContainerModule[]): void;
    loadAsync(...modules: interfaces.AsyncContainerModule[]): Promise<void>;
    unload(...modules: interfaces.ContainerModuleBase[]): void;
    unloadAsync(...modules: interfaces.ContainerModuleBase[]): Promise<void>;
    bind<T>(serviceIdentifier: interfaces.ServiceIdentifier<T>): interfaces.BindingToSyntax<T>;
    rebind<T>(serviceIdentifier: interfaces.ServiceIdentifier<T>): interfaces.BindingToSyntax<T>;
    rebindAsync<T>(serviceIdentifier: interfaces.ServiceIdentifier<T>): Promise<interfaces.BindingToSyntax<T>>;
    unbind(serviceIdentifier: interfaces.ServiceIdentifier): void;
    unbindAsync(serviceIdentifier: interfaces.ServiceIdentifier): Promise<void>;
    unbindAll(): void;
    unbindAllAsync(): Promise<void>;
    onActivation<T>(serviceIdentifier: interfaces.ServiceIdentifier<T>, onActivation: interfaces.BindingActivation<T>): void;
    onDeactivation<T>(serviceIdentifier: interfaces.ServiceIdentifier<T>, onDeactivation: interfaces.BindingDeactivation<T>): void;
    isBound(serviceIdentifier: interfaces.ServiceIdentifier<unknown>): boolean;
    isCurrentBound<T>(serviceIdentifier: interfaces.ServiceIdentifier<T>): boolean;
    isBoundNamed(serviceIdentifier: interfaces.ServiceIdentifier, named: string | number | symbol): boolean;
    isBoundTagged(serviceIdentifier: interfaces.ServiceIdentifier, key: string | number | symbol, value: unknown): boolean;
    snapshot(): void;
    restore(): void;
    createChild(containerOptions?: interfaces.ContainerOptions): Container;
    applyMiddleware(...middlewares: interfaces.Middleware[]): void;
    applyCustomMetadataReader(metadataReader: interfaces.MetadataReader): void;
    get<T>(serviceIdentifier: interfaces.ServiceIdentifier<T>): T;
    getAsync<T>(serviceIdentifier: interfaces.ServiceIdentifier<T>): Promise<T>;
    getTagged<T>(serviceIdentifier: interfaces.ServiceIdentifier<T>, key: string | number | symbol, value: unknown): T;
    getTaggedAsync<T>(serviceIdentifier: interfaces.ServiceIdentifier<T>, key: string | number | symbol, value: unknown): Promise<T>;
    getNamed<T>(serviceIdentifier: interfaces.ServiceIdentifier<T>, named: string | number | symbol): T;
    getNamedAsync<T>(serviceIdentifier: interfaces.ServiceIdentifier<T>, named: string | number | symbol): Promise<T>;
    getAll<T>(serviceIdentifier: interfaces.ServiceIdentifier<T>, options?: interfaces.GetAllOptions): T[];
    getAllAsync<T>(serviceIdentifier: interfaces.ServiceIdentifier<T>, options?: interfaces.GetAllOptions): Promise<T[]>;
    getAllTagged<T>(serviceIdentifier: interfaces.ServiceIdentifier<T>, key: string | number | symbol, value: unknown): T[];
    getAllTaggedAsync<T>(serviceIdentifier: interfaces.ServiceIdentifier<T>, key: string | number | symbol, value: unknown): Promise<T[]>;
    getAllNamed<T>(serviceIdentifier: interfaces.ServiceIdentifier<T>, named: string | number | symbol): T[];
    getAllNamedAsync<T>(serviceIdentifier: interfaces.ServiceIdentifier<T>, named: string | number | symbol): Promise<T[]>;
    resolve<T>(constructorFunction: interfaces.Newable<T>): T;
    tryGet<T>(serviceIdentifier: interfaces.ServiceIdentifier<T>): T | undefined;
    tryGetAsync<T>(serviceIdentifier: interfaces.ServiceIdentifier<T>): Promise<T | undefined>;
    tryGetTagged<T>(serviceIdentifier: interfaces.ServiceIdentifier<T>, key: string | number | symbol, value: unknown): T | undefined;
    tryGetTaggedAsync<T>(serviceIdentifier: interfaces.ServiceIdentifier<T>, key: string | number | symbol, value: unknown): Promise<T | undefined>;
    tryGetNamed<T>(serviceIdentifier: interfaces.ServiceIdentifier<T>, named: string | number | symbol): T | undefined;
    tryGetNamedAsync<T>(serviceIdentifier: interfaces.ServiceIdentifier<T>, named: string | number | symbol): Promise<T | undefined>;
    tryGetAll<T>(serviceIdentifier: interfaces.ServiceIdentifier<T>, options?: interfaces.GetAllOptions): T[];
    tryGetAllAsync<T>(serviceIdentifier: interfaces.ServiceIdentifier<T>, options?: interfaces.GetAllOptions): Promise<T[]>;
    tryGetAllTagged<T>(serviceIdentifier: interfaces.ServiceIdentifier<T>, key: string | number | symbol, value: unknown): T[];
    tryGetAllTaggedAsync<T>(serviceIdentifier: interfaces.ServiceIdentifier<T>, key: string | number | symbol, value: unknown): Promise<T[]>;
    tryGetAllNamed<T>(serviceIdentifier: interfaces.ServiceIdentifier<T>, named: string | number | symbol): T[];
    tryGetAllNamedAsync<T>(serviceIdentifier: interfaces.ServiceIdentifier<T>, named: string | number | symbol): Promise<T[]>;
    private _preDestroy;
    private _removeModuleHandlers;
    private _removeModuleBindings;
    private _deactivate;
    private _handleDeactivationError;
    private _deactivateContainer;
    private _deactivateContainerAsync;
    private _getContainerModuleHelpersFactory;
    private _bind;
    private _buildBinding;
    private _getAll;
    private _get;
    private _getButThrowIfAsync;
    private _getAllArgs;
    private _getNotAllArgs;
    private _getPlanMetadataFromNextArgs;
    private _planAndResolve;
    private _deactivateIfSingleton;
    private _deactivateSingletons;
    private _deactivateSingletonsAsync;
    private _propagateContainerDeactivationThenBindingAndPreDestroy;
    private _propagateContainerDeactivationThenBindingAndPreDestroyAsync;
    private _removeServiceFromDictionary;
    private _bindingDeactivationAndPreDestroy;
    private _bindingDeactivationAndPreDestroyAsync;
}
//# sourceMappingURL=container.d.ts.map

declare const BindingScopeEnum: interfaces.BindingScopeEnum;
declare const BindingTypeEnum: interfaces.BindingTypeEnum;
declare const TargetTypeEnum: interfaces.TargetTypeEnum;
//# sourceMappingURL=literal_types.d.ts.map

declare class ContainerModule implements interfaces.ContainerModule {
    id: number;
    registry: interfaces.ContainerModuleCallBack;
    constructor(registry: interfaces.ContainerModuleCallBack);
}
declare class AsyncContainerModule implements interfaces.AsyncContainerModule {
    id: number;
    registry: interfaces.AsyncContainerModuleCallBack;
    constructor(registry: interfaces.AsyncContainerModuleCallBack);
}

type Prototype<T> = {
    [Property in keyof T]: T[Property] extends NewableFunction ? T[Property] : T[Property] | undefined;
} & {
    constructor: NewableFunction;
};
interface ConstructorFunction<T = Record<string, unknown>> {
    prototype: Prototype<T>;
    new (...args: unknown[]): T;
}
type DecoratorTarget<T = unknown> = ConstructorFunction<T> | Prototype<T>;
declare function createTaggedDecorator(metadata: interfaces.MetadataOrMetadataArray): <T>(target: DecoratorTarget, targetKey?: string | symbol, indexOrPropertyDescriptor?: number | TypedPropertyDescriptor<T>) => void;
declare function decorate(decorator: DecoratorTarget | ParameterDecorator | MethodDecorator, target: object, parameterIndexOrProperty?: number | string): void;

declare function injectable(): <T extends abstract new (...args: any) => unknown>(target: T) => T;
//# sourceMappingURL=injectable.d.ts.map

declare function tagged(metadataKey: string | number | symbol, metadataValue: unknown): <T>(target: DecoratorTarget, targetKey?: string | symbol, indexOrPropertyDescriptor?: number | TypedPropertyDescriptor<T>) => void;
//# sourceMappingURL=tagged.d.ts.map

declare function named(name: string | number | symbol): <T>(target: DecoratorTarget, targetKey?: string | symbol, indexOrPropertyDescriptor?: number | TypedPropertyDescriptor<T>) => void;
//# sourceMappingURL=named.d.ts.map

declare const inject: <T = unknown>(serviceIdentifier: interfaces.ServiceIdentifier<T> | LazyServiceIdentifier<T>) => (target: DecoratorTarget, targetKey?: string | symbol, indexOrPropertyDescriptor?: number | TypedPropertyDescriptor<T>) => void;
//# sourceMappingURL=inject.d.ts.map

declare function optional(): <T>(target: DecoratorTarget, targetKey?: string | symbol, indexOrPropertyDescriptor?: number | TypedPropertyDescriptor<T>) => void;
//# sourceMappingURL=optional.d.ts.map

declare function unmanaged(): (target: DecoratorTarget, targetKey: string | undefined, index: number) => void;
//# sourceMappingURL=unmanaged.d.ts.map

declare const multiInject: <T = unknown>(serviceIdentifier: interfaces.ServiceIdentifier<T> | LazyServiceIdentifier<T>) => (target: DecoratorTarget, targetKey?: string | symbol, indexOrPropertyDescriptor?: number | TypedPropertyDescriptor<T>) => void;
//# sourceMappingURL=multi_inject.d.ts.map

declare function targetName(name: string): (target: DecoratorTarget, targetKey: string | undefined, index: number) => void;
//# sourceMappingURL=target_name.d.ts.map

declare const postConstruct: () => (target: {
    constructor: NewableFunction;
}, propertyKey: string) => void;
//# sourceMappingURL=post_construct.d.ts.map

declare const preDestroy: () => (target: {
    constructor: NewableFunction;
}, propertyKey: string) => void;
//# sourceMappingURL=pre_destroy.d.ts.map

declare class MetadataReader implements interfaces.MetadataReader {
    getConstructorMetadata(constructorFunc: NewableFunction): interfaces.ConstructorMetadata;
    getPropertiesMetadata(constructorFunc: NewableFunction): interfaces.MetadataMap;
}
//# sourceMappingURL=metadata_reader.d.ts.map

declare function id(): number;
//# sourceMappingURL=id.d.ts.map

declare const traverseAncerstors: (request: interfaces.Request, constraint: interfaces.ConstraintFunction) => boolean;
declare const taggedConstraint: (key: string | number | symbol) => (value: unknown) => interfaces.ConstraintFunction;
declare const namedConstraint: (value: unknown) => interfaces.ConstraintFunction;
declare const typeConstraint: (type: NewableFunction | string) => (request: interfaces.Request | null) => boolean;
//# sourceMappingURL=constraint_helpers.d.ts.map

declare function getServiceIdentifierAsString(serviceIdentifier: interfaces.ServiceIdentifier): string;//# sourceMappingURL=serialization.d.ts.map

declare const multiBindToService: (container: interfaces.Container) => (service: interfaces.ServiceIdentifier) => (...types: interfaces.ServiceIdentifier[]) => void;

/**
 * @deprecated Use LazyServiceIdentifier instead
 */
declare const LazyServiceIdentifer: typeof LazyServiceIdentifier;
declare const METADATA_KEY: typeof keys;

export { AsyncContainerModule, BindingScopeEnum, BindingTypeEnum, Container, ContainerModule, LazyServiceIdentifer, METADATA_KEY, MetadataReader, TargetTypeEnum, createTaggedDecorator, decorate, getServiceIdentifierAsString, id, inject, injectable, interfaces, multiBindToService, multiInject, named, namedConstraint, optional, postConstruct, preDestroy, tagged, taggedConstraint, targetName, traverseAncerstors, typeConstraint, unmanaged };
