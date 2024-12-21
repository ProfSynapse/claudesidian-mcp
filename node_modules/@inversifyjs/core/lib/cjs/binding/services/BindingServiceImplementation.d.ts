import { ServiceIdentifier } from '@inversifyjs/common';
import { Binding } from '../models/Binding';
import { BindingService } from './BindingService';
export declare class BindingServiceImplementation implements BindingService {
    #private;
    constructor();
    get<TInstance>(serviceIdentifier: ServiceIdentifier): Binding<TInstance>[] | undefined;
    remove(serviceIdentifier: ServiceIdentifier): void;
    removeByModule(moduleId: number): void;
    set<TInstance>(binding: Binding<TInstance>): void;
}
//# sourceMappingURL=BindingServiceImplementation.d.ts.map