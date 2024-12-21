import { Newable } from '@inversifyjs/common';
import { ClassElementMetadata } from '../../metadata/models/ClassElementMetadata';
import { ClassMetadata } from '../../metadata/models/ClassMetadata';
import { LegacyTarget } from '../models/LegacyTarget';
export declare function getTargetsFromMetadataProviders(getClassMetadata: (type: Newable) => ClassMetadata, getClassMetadataProperties: (type: Newable) => Map<string | symbol, ClassElementMetadata>): (type: Newable) => LegacyTarget[];
//# sourceMappingURL=getTargetsFromMetadataProviders.d.ts.map