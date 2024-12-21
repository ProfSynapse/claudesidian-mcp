import { Binding } from '../../binding/models/Binding';
import { BindingNodeParent } from './BindingNodeParent';
export interface BaseBindingNode<TBinding extends Binding<any> = Binding<any>> {
    readonly parent: BindingNodeParent;
    readonly binding: TBinding;
}
//# sourceMappingURL=BaseBindingNode.d.ts.map