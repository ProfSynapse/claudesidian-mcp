import { ServiceIdentifier, Newable, LazyServiceIdentifier } from '@inversifyjs/common';

interface LegacyMetadata<TValue = unknown> {
    key: string | number | symbol;
    value: TValue;
}

interface LegacyMetadataMap {
    [propertyNameOrArgumentIndex: string | symbol]: LegacyMetadata[];
}

interface LegacyConstructorMetadata {
    compilerGeneratedMetadata: NewableFunction[] | undefined;
    userGeneratedMetadata: LegacyMetadataMap;
}

interface LegacyMetadataReader {
    getConstructorMetadata(constructorFunc: NewableFunction): LegacyConstructorMetadata;
    getPropertiesMetadata(constructorFunc: NewableFunction): LegacyMetadataMap;
}

type MetadataName = number | string | symbol;

type MetadataTag = number | string | symbol;

interface LegacyQueryableString {
    startsWith(searchString: string): boolean;
    endsWith(searchString: string): boolean;
    contains(searchString: string): boolean;
    equals(compareString: string): boolean;
    value(): string;
}

type LegacyTargetType = 'ConstructorArgument' | 'ClassProperty' | 'Variable';

interface LegacyTarget {
    id: number;
    serviceIdentifier: ServiceIdentifier;
    type: LegacyTargetType;
    name: LegacyQueryableString;
    identifier: string | symbol;
    metadata: LegacyMetadata[];
    getNamedTag(): LegacyMetadata<MetadataName> | null;
    getCustomTags(): LegacyMetadata[] | null;
    hasTag(key: MetadataTag): boolean;
    isArray(): boolean;
    matchesArray(name: ServiceIdentifier): boolean;
    isNamed(): boolean;
    isTagged(): boolean;
    isOptional(): boolean;
    matchesNamedTag(name: MetadataName): boolean;
    matchesTag(key: MetadataTag): (value: unknown) => boolean;
}

declare const getTargets: (metadataReader?: LegacyMetadataReader) => (type: Newable) => LegacyTarget[];

interface BaseClassElementMetadata<TKind> {
    kind: TKind;
}

declare enum ClassElementMetadataKind {
    multipleInjection = 0,
    singleInjection = 1,
    unmanaged = 2
}

type MetadataTargetName = string;

interface ManagedClassElementMetadata extends BaseClassElementMetadata<ClassElementMetadataKind.singleInjection | ClassElementMetadataKind.multipleInjection> {
    name: MetadataName | undefined;
    optional: boolean;
    tags: Map<MetadataTag, unknown>;
    targetName: MetadataTargetName | undefined;
    value: ServiceIdentifier | LazyServiceIdentifier;
}

declare class LegacyTargetImpl implements LegacyTarget {
    #private;
    constructor(identifier: string | symbol, metadata: ManagedClassElementMetadata, type: LegacyTargetType);
    get id(): number;
    /**
     * If this is a class property target, this is the name of the property to be injected
     */
    get identifier(): string | symbol;
    get metadata(): LegacyMetadata[];
    get name(): LegacyQueryableString;
    get type(): LegacyTargetType;
    get serviceIdentifier(): ServiceIdentifier;
    getCustomTags(): LegacyMetadata[] | null;
    getNamedTag(): LegacyMetadata<MetadataName> | null;
    hasTag(key: MetadataTag): boolean;
    isArray(): boolean;
    isNamed(): boolean;
    isOptional(): boolean;
    isTagged(): boolean;
    matchesArray(name: ServiceIdentifier): boolean;
    matchesNamedTag(name: MetadataName): boolean;
    matchesTag(key: MetadataTag): (value: unknown) => boolean;
}

type UnmanagedClassElementMetadata = BaseClassElementMetadata<ClassElementMetadataKind.unmanaged>;

type ClassElementMetadata = ManagedClassElementMetadata | UnmanagedClassElementMetadata;

declare function getClassElementMetadataFromLegacyMetadata(metadataList: LegacyMetadata[]): ClassElementMetadata;

interface ClassMetadataLifecycle {
    postConstructMethodName: string | symbol | undefined;
    preDestroyMethodName: string | symbol | undefined;
}

interface ClassMetadata {
    constructorArguments: ClassElementMetadata[];
    lifecycle: ClassMetadataLifecycle;
    properties: Map<string | symbol, ClassElementMetadata>;
}

declare function getClassMetadata(type: Newable): ClassMetadata;

declare function getClassMetadataFromMetadataReader(type: Newable, metadataReader: LegacyMetadataReader): ClassMetadata;

export { type ClassElementMetadata, ClassElementMetadataKind, type ClassMetadata, type ClassMetadataLifecycle, type LegacyMetadata, type LegacyMetadataMap, type LegacyMetadataReader, type LegacyQueryableString, type LegacyTarget, LegacyTargetImpl, type LegacyTargetType, type ManagedClassElementMetadata, type MetadataName, type MetadataTag, type MetadataTargetName, type UnmanagedClassElementMetadata, getClassElementMetadataFromLegacyMetadata, getClassMetadata, getClassMetadataFromMetadataReader, getTargets };
