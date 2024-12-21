"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.plan = plan;
const common_1 = require("@inversifyjs/common");
const BindingType_1 = require("../../binding/models/BindingType");
const ClassElementMetadataKind_1 = require("../../metadata/models/ClassElementMetadataKind");
const addBranchService_1 = require("../actions/addBranchService");
const checkServiceNodeSingleInjectionBindings_1 = require("./checkServiceNodeSingleInjectionBindings");
const isPlanServiceRedirectionBindingNode_1 = require("./isPlanServiceRedirectionBindingNode");
function plan(params) {
    const serviceBindings = params.getBindings(params.rootConstraints.serviceIdentifier) ?? [];
    const tags = new Map();
    if (params.rootConstraints.tag !== undefined) {
        tags.set(params.rootConstraints.tag.key, params.rootConstraints.tag.value);
    }
    const bindingMetadata = {
        name: params.rootConstraints.name,
        tags,
    };
    const filteredServiceBindings = serviceBindings.filter((binding) => binding.isSatisfiedBy(bindingMetadata));
    const serviceNodeBindings = [];
    const serviceNode = {
        bindings: serviceNodeBindings,
        parent: undefined,
        serviceIdentifier: params.rootConstraints.serviceIdentifier,
    };
    serviceNodeBindings.push(...buildServiceNodeBindings(params, bindingMetadata, filteredServiceBindings, serviceNode));
    if (!params.rootConstraints.isMultiple) {
        (0, checkServiceNodeSingleInjectionBindings_1.checkServiceNodeSingleInjectionBindings)(serviceNode, false);
        const [planBindingNode] = serviceNodeBindings;
        serviceNode.bindings = planBindingNode;
    }
    return {
        tree: {
            root: serviceNode,
        },
    };
}
function buildInstancePlanBindingNode(params, binding, parentNode) {
    const classMetadata = params.getClassMetadata(binding.implementationType);
    const childNode = {
        binding: binding,
        classMetadata,
        constructorParams: [],
        parent: parentNode,
        propertyParams: new Map(),
    };
    const subplanParams = {
        getBindings: params.getBindings,
        getClassMetadata: params.getClassMetadata,
        node: childNode,
        servicesBranch: params.servicesBranch,
    };
    return subplan(subplanParams);
}
function buildPlanServiceNodeFromClassElementMetadata(params, elementMetadata) {
    if (elementMetadata.kind === ClassElementMetadataKind_1.ClassElementMetadataKind.unmanaged) {
        return undefined;
    }
    const serviceIdentifier = common_1.LazyServiceIdentifier.is(elementMetadata.value)
        ? elementMetadata.value.unwrap()
        : elementMetadata.value;
    const serviceBindings = params.getBindings(serviceIdentifier) ?? [];
    const bindingMetadata = {
        name: elementMetadata.name,
        tags: elementMetadata.tags,
    };
    const filteredServiceBindings = serviceBindings.filter((binding) => binding.isSatisfiedBy(bindingMetadata));
    const serviceNodeBindings = [];
    const serviceNode = {
        bindings: serviceNodeBindings,
        parent: params.node,
        serviceIdentifier,
    };
    serviceNodeBindings.push(...buildServiceNodeBindings(params, bindingMetadata, filteredServiceBindings, serviceNode));
    if (elementMetadata.kind === ClassElementMetadataKind_1.ClassElementMetadataKind.singleInjection) {
        (0, checkServiceNodeSingleInjectionBindings_1.checkServiceNodeSingleInjectionBindings)(serviceNode, elementMetadata.optional);
        const [planBindingNode] = serviceNodeBindings;
        serviceNode.bindings = planBindingNode;
    }
    return serviceNode;
}
function buildServiceNodeBindings(params, bindingMetadata, serviceBindings, parentNode) {
    const serviceIdentifier = (0, isPlanServiceRedirectionBindingNode_1.isPlanServiceRedirectionBindingNode)(parentNode)
        ? parentNode.binding.targetServiceIdentifier
        : parentNode.serviceIdentifier;
    (0, addBranchService_1.addBranchService)(params, serviceIdentifier);
    const planBindingNodes = [];
    for (const binding of serviceBindings) {
        switch (binding.type) {
            case BindingType_1.bindingTypeValues.Instance: {
                planBindingNodes.push(buildInstancePlanBindingNode(params, binding, parentNode));
                break;
            }
            case BindingType_1.bindingTypeValues.ServiceRedirection: {
                const planBindingNode = buildServiceRedirectionPlanBindingNode(params, bindingMetadata, binding, parentNode);
                planBindingNodes.push(planBindingNode);
                break;
            }
            default:
                planBindingNodes.push({
                    binding: binding,
                    parent: parentNode,
                });
        }
    }
    params.servicesBranch.delete(serviceIdentifier);
    return planBindingNodes;
}
function buildServiceRedirectionPlanBindingNode(params, bindingMetadata, binding, parentNode) {
    const childNode = {
        binding,
        parent: parentNode,
        redirections: [],
    };
    const serviceBindings = params.getBindings(binding.targetServiceIdentifier) ?? [];
    const filteredServiceBindings = serviceBindings.filter((binding) => binding.isSatisfiedBy(bindingMetadata));
    childNode.redirections.push(...buildServiceNodeBindings(params, bindingMetadata, filteredServiceBindings, childNode));
    return childNode;
}
function subplan(params) {
    const classMetadata = params.node.classMetadata;
    for (const [index, elementMetadata,] of classMetadata.constructorArguments.entries()) {
        params.node.constructorParams[index] =
            buildPlanServiceNodeFromClassElementMetadata(params, elementMetadata);
    }
    for (const [propertyKey, elementMetadata] of classMetadata.properties) {
        const planServiceNode = buildPlanServiceNodeFromClassElementMetadata(params, elementMetadata);
        if (planServiceNode !== undefined) {
            params.node.propertyParams.set(propertyKey, planServiceNode);
        }
    }
    return params.node;
}
//# sourceMappingURL=plan.js.map