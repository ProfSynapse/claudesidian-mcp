import { BaseClassElementMetadata } from './BaseClassElementMetadata';
import { MaybeClassElementMetadataKind } from './MaybeClassElementMetadataKind';
import { MetadataName } from './MetadataName';
import { MetadataTag } from './MetadataTag';
import { MetadataTargetName } from './MetadataTargetName';
export interface MaybeManagedClassElementMetadata extends BaseClassElementMetadata<MaybeClassElementMetadataKind.unknown> {
    name: MetadataName | undefined;
    optional: boolean;
    tags: Map<MetadataTag, unknown>;
    targetName: MetadataTargetName | undefined;
}
//# sourceMappingURL=MaybeManagedClassElementMetadata.d.ts.map