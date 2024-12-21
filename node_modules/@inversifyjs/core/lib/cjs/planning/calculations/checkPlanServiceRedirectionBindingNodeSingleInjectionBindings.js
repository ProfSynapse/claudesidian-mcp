"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkPlanServiceRedirectionBindingNodeSingleInjectionBindings = checkPlanServiceRedirectionBindingNodeSingleInjectionBindings;
const isPlanServiceRedirectionBindingNode_1 = require("./isPlanServiceRedirectionBindingNode");
const throwErrorWhenUnexpectedBindingsAmountFound_1 = require("./throwErrorWhenUnexpectedBindingsAmountFound");
const SINGLE_INJECTION_BINDINGS = 1;
function checkPlanServiceRedirectionBindingNodeSingleInjectionBindings(serviceRedirectionBindingNode, isOptional) {
    if (serviceRedirectionBindingNode.redirections.length ===
        SINGLE_INJECTION_BINDINGS) {
        const [planBindingNode] = serviceRedirectionBindingNode.redirections;
        if ((0, isPlanServiceRedirectionBindingNode_1.isPlanServiceRedirectionBindingNode)(planBindingNode)) {
            checkPlanServiceRedirectionBindingNodeSingleInjectionBindings(planBindingNode, isOptional);
        }
        return;
    }
    (0, throwErrorWhenUnexpectedBindingsAmountFound_1.throwErrorWhenUnexpectedBindingsAmountFound)(serviceRedirectionBindingNode.redirections, isOptional, serviceRedirectionBindingNode);
}
//# sourceMappingURL=checkPlanServiceRedirectionBindingNodeSingleInjectionBindings.js.map