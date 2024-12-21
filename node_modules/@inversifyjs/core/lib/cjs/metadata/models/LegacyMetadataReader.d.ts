import { LegacyConstructorMetadata } from './LegacyConstructorMetadata';
import { LegacyMetadataMap } from './LegacyMetadataMap';
export interface LegacyMetadataReader {
    getConstructorMetadata(constructorFunc: NewableFunction): LegacyConstructorMetadata;
    getPropertiesMetadata(constructorFunc: NewableFunction): LegacyMetadataMap;
}
//# sourceMappingURL=LegacyMetadataReader.d.ts.map