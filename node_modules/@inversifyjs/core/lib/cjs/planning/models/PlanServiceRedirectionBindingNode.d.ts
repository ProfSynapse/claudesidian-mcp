import { ServiceRedirectionBinding } from '../../binding/models/ServiceRedirectionBinding';
import { BaseBindingNode } from './BaseBindingNode';
import { PlanBindingNode } from './PlanBindingNode';
export interface PlanServiceRedirectionBindingNode<TBinding extends ServiceRedirectionBinding<any> = ServiceRedirectionBinding<any>> extends BaseBindingNode<TBinding> {
    redirections: PlanBindingNode[];
}
//# sourceMappingURL=PlanServiceRedirectionBindingNode.d.ts.map