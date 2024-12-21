"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Request = void 0;
const id_1 = require("../utils/id");
class Request {
    id;
    serviceIdentifier;
    parentContext;
    parentRequest;
    bindings;
    childRequests;
    target;
    requestScope;
    constructor(serviceIdentifier, parentContext, parentRequest, 
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bindings, target) {
        this.id = (0, id_1.id)();
        this.serviceIdentifier = serviceIdentifier;
        this.parentContext = parentContext;
        this.parentRequest = parentRequest;
        this.target = target;
        this.childRequests = [];
        this.bindings = Array.isArray(bindings) ? bindings : [bindings];
        // Set requestScope if Request is the root request
        this.requestScope = parentRequest === null ? new Map() : null;
    }
    addChildRequest(serviceIdentifier, bindings, target) {
        const child = new Request(serviceIdentifier, this.parentContext, this, bindings, target);
        this.childRequests.push(child);
        return child;
    }
}
exports.Request = Request;
//# sourceMappingURL=request.js.map