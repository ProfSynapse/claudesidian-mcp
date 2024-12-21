declare function propertyEventDecorator(eventKey: string, errorMessage: string): () => (target: {
    constructor: NewableFunction;
}, propertyKey: string) => void;
export { propertyEventDecorator };
//# sourceMappingURL=property_event_decorator.d.ts.map