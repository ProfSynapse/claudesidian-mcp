"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.throwErrorWhenUnexpectedBindingsAmountFound = throwErrorWhenUnexpectedBindingsAmountFound;
const common_1 = require("@inversifyjs/common");
const stringifyBinding_1 = require("../../binding/calculations/stringifyBinding");
const InversifyCoreError_1 = require("../../error/models/InversifyCoreError");
const InversifyCoreErrorKind_1 = require("../../error/models/InversifyCoreErrorKind");
const isPlanServiceRedirectionBindingNode_1 = require("./isPlanServiceRedirectionBindingNode");
function throwErrorWhenUnexpectedBindingsAmountFound(bindings, isOptional, node) {
    let serviceIdentifier;
    let parentServiceIdentifier;
    if ((0, isPlanServiceRedirectionBindingNode_1.isPlanServiceRedirectionBindingNode)(node)) {
        serviceIdentifier = node.binding.targetServiceIdentifier;
        parentServiceIdentifier = node.binding.serviceIdentifier;
    }
    else {
        serviceIdentifier = node.serviceIdentifier;
        parentServiceIdentifier = node.parent?.binding.serviceIdentifier;
    }
    if (Array.isArray(bindings)) {
        throwErrorWhenMultipleUnexpectedBindingsAmountFound(bindings, isOptional, serviceIdentifier, parentServiceIdentifier);
    }
    else {
        throwErrorWhenSingleUnexpectedBindingFound(bindings, isOptional, serviceIdentifier, parentServiceIdentifier);
    }
}
function throwBindingNotFoundError(serviceIdentifier, parentServiceIdentifier) {
    const errorMessage = `No bindings found for service: "${(0, common_1.stringifyServiceIdentifier)(serviceIdentifier)}".

Trying to resolve bindings for "${stringifyParentServiceIdentifier(serviceIdentifier, parentServiceIdentifier)}".`;
    throw new InversifyCoreError_1.InversifyCoreError(InversifyCoreErrorKind_1.InversifyCoreErrorKind.planning, errorMessage);
}
function throwErrorWhenMultipleUnexpectedBindingsAmountFound(bindings, isOptional, serviceIdentifier, parentServiceIdentifier) {
    if (bindings.length === 0) {
        if (!isOptional) {
            throwBindingNotFoundError(serviceIdentifier, parentServiceIdentifier);
        }
    }
    else {
        const errorMessage = `Ambiguous bindings found for service: "${(0, common_1.stringifyServiceIdentifier)(serviceIdentifier)}".

Registered bindings:

${bindings.map((binding) => (0, stringifyBinding_1.stringifyBinding)(binding.binding)).join('\n')}

Trying to resolve bindings for "${stringifyParentServiceIdentifier(serviceIdentifier, parentServiceIdentifier)}".`;
        throw new InversifyCoreError_1.InversifyCoreError(InversifyCoreErrorKind_1.InversifyCoreErrorKind.planning, errorMessage);
    }
}
function throwErrorWhenSingleUnexpectedBindingFound(bindings, isOptional, serviceIdentifier, parentServiceIdentifier) {
    if (bindings === undefined && !isOptional) {
        throwBindingNotFoundError(serviceIdentifier, parentServiceIdentifier);
    }
    else {
        return;
    }
}
function stringifyParentServiceIdentifier(serviceIdentifier, parentServiceIdentifier) {
    return parentServiceIdentifier === undefined
        ? `${(0, common_1.stringifyServiceIdentifier)(serviceIdentifier)} (Root service)`
        : (0, common_1.stringifyServiceIdentifier)(parentServiceIdentifier);
}
//# sourceMappingURL=throwErrorWhenUnexpectedBindingsAmountFound.js.map