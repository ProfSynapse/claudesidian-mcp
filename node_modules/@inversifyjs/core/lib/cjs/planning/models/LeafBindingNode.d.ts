import { ConstantValueBinding } from '../../binding/models/ConstantValueBinding';
import { DynamicValueBinding } from '../../binding/models/DynamicValueBinding';
import { FactoryBinding } from '../../binding/models/FactoryBinding';
import { ProviderBinding } from '../../binding/models/ProviderBinding';
import { BaseBindingNode } from './BaseBindingNode';
export type LeafBindingNode = BaseBindingNode<ConstantValueBinding<any> | DynamicValueBinding<any> | FactoryBinding<any> | ProviderBinding<any>>;
//# sourceMappingURL=LeafBindingNode.d.ts.map