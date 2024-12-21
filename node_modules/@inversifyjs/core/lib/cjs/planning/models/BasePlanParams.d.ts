import { Newable, ServiceIdentifier } from '@inversifyjs/common';
import { Binding } from '../../binding/models/Binding';
import { ClassMetadata } from '../../metadata/models/ClassMetadata';
export interface BasePlanParams {
    getBindings: <TInstance>(serviceIdentifier: ServiceIdentifier<TInstance>) => Binding<TInstance>[] | undefined;
    getClassMetadata: (type: Newable) => ClassMetadata;
    servicesBranch: Set<ServiceIdentifier>;
}
//# sourceMappingURL=BasePlanParams.d.ts.map