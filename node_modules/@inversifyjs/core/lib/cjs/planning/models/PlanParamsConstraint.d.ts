import { ServiceIdentifier } from '@inversifyjs/common';
import { MetadataName } from '../../metadata/models/MetadataName';
import { PlanParamsTagConstraint } from './PlanParamsTagConstraint';
export interface PlanParamsConstraint {
    name?: MetadataName;
    isMultiple: boolean;
    serviceIdentifier: ServiceIdentifier;
    tag?: PlanParamsTagConstraint;
}
//# sourceMappingURL=PlanParamsConstraint.d.ts.map