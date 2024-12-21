import { ServiceIdentifier } from '@inversifyjs/common';
import { LegacyMetadata } from '../../metadata/models/LegacyMetadata';
import { ManagedClassElementMetadata } from '../../metadata/models/ManagedClassElementMetadata';
import { MetadataName } from '../../metadata/models/MetadataName';
import { MetadataTag } from '../../metadata/models/MetadataTag';
import { LegacyQueryableString } from '../../string/models/LegacyQueryableString';
import { LegacyTarget } from './LegacyTarget';
import { LegacyTargetType } from './LegacyTargetType';
export declare class LegacyTargetImpl implements LegacyTarget {
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
//# sourceMappingURL=LegacyTargetImpl.d.ts.map