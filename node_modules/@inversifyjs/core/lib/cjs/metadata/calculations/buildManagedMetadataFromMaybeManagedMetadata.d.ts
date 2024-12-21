import { LazyServiceIdentifier, ServiceIdentifier } from '@inversifyjs/common';
import { ClassElementMetadataKind } from '../models/ClassElementMetadataKind';
import { ManagedClassElementMetadata } from '../models/ManagedClassElementMetadata';
import { MaybeManagedClassElementMetadata } from '../models/MaybeManagedClassElementMetadata';
export declare function buildManagedMetadataFromMaybeManagedMetadata(metadata: MaybeManagedClassElementMetadata, kind: ClassElementMetadataKind.singleInjection | ClassElementMetadataKind.multipleInjection, serviceIdentifier: ServiceIdentifier | LazyServiceIdentifier): ManagedClassElementMetadata;
//# sourceMappingURL=buildManagedMetadataFromMaybeManagedMetadata.d.ts.map