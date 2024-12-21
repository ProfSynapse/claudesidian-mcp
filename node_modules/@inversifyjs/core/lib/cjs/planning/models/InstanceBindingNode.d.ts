import { InstanceBinding } from '../../binding/models/InstanceBinding';
import { ClassMetadata } from '../../metadata/models/ClassMetadata';
import { BaseBindingNode } from './BaseBindingNode';
import { PlanServiceNode } from './PlanServiceNode';
export interface InstanceBindingNode<TBinding extends InstanceBinding<any> = InstanceBinding<any>> extends BaseBindingNode<TBinding> {
    readonly classMetadata: ClassMetadata;
    readonly constructorParams: (PlanServiceNode | undefined)[];
    readonly propertyParams: Map<string | symbol, PlanServiceNode>;
}
//# sourceMappingURL=InstanceBindingNode.d.ts.map