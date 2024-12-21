"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addBranchService = addBranchService;
const common_1 = require("@inversifyjs/common");
const InversifyCoreError_1 = require("../../error/models/InversifyCoreError");
const InversifyCoreErrorKind_1 = require("../../error/models/InversifyCoreErrorKind");
function addBranchService(params, serviceIdentifier) {
    if (params.servicesBranch.has(serviceIdentifier)) {
        throwError(params, serviceIdentifier);
    }
    params.servicesBranch.add(serviceIdentifier);
}
function stringifyServiceIdentifierTrace(serviceIdentifiers) {
    return [...serviceIdentifiers].map(common_1.stringifyServiceIdentifier).join(' -> ');
}
function throwError(params, serviceIdentifier) {
    const stringifiedCircularDependencies = stringifyServiceIdentifierTrace([
        ...params.servicesBranch,
        serviceIdentifier,
    ]);
    throw new InversifyCoreError_1.InversifyCoreError(InversifyCoreErrorKind_1.InversifyCoreErrorKind.planning, `Circular dependency found: ${stringifiedCircularDependencies}`);
}
//# sourceMappingURL=addBranchService.js.map