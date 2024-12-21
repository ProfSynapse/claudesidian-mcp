import { ServiceIdentifier } from '@inversifyjs/common';
import { LegacyMetadata } from '../../metadata/models/LegacyMetadata';
import { MetadataName } from '../../metadata/models/MetadataName';
import { MetadataTag } from '../../metadata/models/MetadataTag';
import { LegacyQueryableString } from '../../string/models/LegacyQueryableString';
import { LegacyTargetType } from './LegacyTargetType';
export interface LegacyTarget {
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
//# sourceMappingURL=LegacyTarget.d.ts.map