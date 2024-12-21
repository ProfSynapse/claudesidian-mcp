"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkServiceNodeSingleInjectionBindings = checkServiceNodeSingleInjectionBindings;
const checkPlanServiceRedirectionBindingNodeSingleInjectionBindings_1 = require("./checkPlanServiceRedirectionBindingNodeSingleInjectionBindings");
const isPlanServiceRedirectionBindingNode_1 = require("./isPlanServiceRedirectionBindingNode");
const throwErrorWhenUnexpectedBindingsAmountFound_1 = require("./throwErrorWhenUnexpectedBindingsAmountFound");
const SINGLE_INJECTION_BINDINGS = 1;
function checkServiceNodeSingleInjectionBindings(serviceNode, isOptional) {
    if (Array.isArray(serviceNode.bindings)) {
        if (serviceNode.bindings.length === SINGLE_INJECTION_BINDINGS) {
            const [planBindingNode] = serviceNode.bindings;
            if ((0, isPlanServiceRedirectionBindingNode_1.isPlanServiceRedirectionBindingNode)(planBindingNode)) {
                (0, checkPlanServiceRedirectionBindingNodeSingleInjectionBindings_1.checkPlanServiceRedirectionBindingNodeSingleInjectionBindings)(planBindingNode, isOptional);
            }
            return;
        }
    }
    (0, throwErrorWhenUnexpectedBindingsAmountFound_1.throwErrorWhenUnexpectedBindingsAmountFound)(serviceNode.bindings, isOptional, serviceNode);
}
//# sourceMappingURL=checkServiceNodeSingleInjectionBindings.js.map