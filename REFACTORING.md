# Claudesidian MCP Refactoring

This document outlines the refactoring done to improve the Claudesidian MCP plugin architecture by applying the Single Responsibility Principle (SRP) and Dependency Injection (DI) patterns.

## Architectural Improvements

### 1. Single Responsibility Principle (SRP)

We've split large, multi-purpose classes into smaller, focused ones:

- **VaultManager** → Split into:
  - `NoteService`: Handles note operations
  - `FolderService`: Handles folder operations
  - `PathService`: Handles path operations
  - `VaultManagerFacade`: Acts as a facade for backward compatibility

- **AI Adapters** → Split into:
  - `HttpClient`: Handles HTTP requests
  - `OpenRouterAdapter`: Handles OpenRouter API interactions

### 2. Dependency Injection (DI)

We've made dependencies explicit through constructor injection:

```typescript
// Before
class SomeClass {
    constructor() {
        this.dependency = new Dependency();
    }
}

// After
class SomeClass {
    constructor(private dependency: IDependency) {}
}
```

Examples:
- `NoteService` receives `Vault` and `PathService`
- `FolderService` receives `Vault` and `PathService`
- `OpenRouterAdapter` receives `HttpClient`
- `CompletionToolDI` receives `IAIAdapter`

### 3. Interface-Based Design

We've defined clear interfaces for all services:

- `INoteService`
- `IFolderService`
- `IPathService`
- `IVaultManager`
- `IHttpClient`
- `IAIAdapter`
- `IToolRegistry`
- `IToolContext`
- `IConversationManager`

### 4. Service Provider

We've created a `ServiceProvider` class that:

- Manages all service instances
- Handles dependency resolution
- Provides a clean API for getting services

## Benefits of the New Architecture

1. **Improved Testability**: Services can be tested in isolation with mock dependencies
2. **Better Maintainability**: Each class has a single responsibility
3. **Easier Extension**: New implementations can be added without changing existing code
4. **Reduced Coupling**: Classes depend on interfaces, not concrete implementations
5. **Clearer Code Organization**: The codebase is more navigable with clear separation of concerns

## Usage Examples

### Creating Services with Dependencies

```typescript
// Create services with dependencies
const pathService = new PathService();
const noteService = new NoteService(vault, pathService);
const folderService = new FolderService(vault, pathService);

// Create a facade for backward compatibility
const vaultManager = new VaultManagerFacade(
    noteService,
    folderService,
    pathService,
    app
);
```

### Using the Service Provider

```typescript
// Get services from the service provider
const serviceProvider = new ServiceProvider(app, plugin);
const noteService = serviceProvider.get<INoteService>('noteService');
const folderService = serviceProvider.get<IFolderService>('folderService');
const aiAdapter = serviceProvider.get<IAIAdapter>('aiAdapter');

// Use the services
await noteService.createNote('path/to/note.md', 'Note content');
await folderService.createFolder('path/to/folder');
const response = await aiAdapter.generateResponse('Hello', 'model-name');
```

### Creating Tools with Dependency Injection

```typescript
// Create a tool with dependencies
const completionTool = new CompletionToolDI(
    toolContext,
    serviceProvider.get<IAIAdapter>('aiAdapter')
);

// Use the tool
const result = await completionTool.execute({
    prompt: 'Hello, world!',
    temperature: 0.7
});
```

## Challenges and Solutions

### Circular Dependencies

During the refactoring, we encountered circular dependencies between interface files:

```
IToolContext -> IVaultManager -> IToolRegistry -> IToolContext
```

We solved this by:

1. **Consolidated interfaces**: Created a single `ToolInterfaces.ts` file that contains all tool-related interfaces
2. **Type casting**: Used `any` type casting in places where type mismatches occurred due to the transition period
3. **Forward declarations**: Used forward declarations in some files to break circular dependencies

### Type Mismatches

The original code used concrete classes in many places, which caused type mismatches when we tried to use interfaces:

```typescript
// Original code expects concrete VaultManager class
constructor(vault: VaultManager) { ... }

// Our refactored code uses IVaultManager interface
constructor(vault: IVaultManager) { ... }
```

We addressed this with:

1. **Type casting**: Used `as any` in places where we needed to pass an interface to a method expecting a concrete class
2. **Facade pattern**: Created `VaultManagerFacade` that implements `IVaultManager` but can be passed where `VaultManager` is expected

## Future Improvements

1. **Update BaseTool and ToolRegistry**: Modify to use interfaces instead of concrete classes
2. **Update CompletionTool**: Replace the original implementation with the DI version
3. **Add Unit Tests**: Create tests for each service using mock dependencies
4. **Add Error Handling**: Implement more robust error handling in services
5. **Add Caching**: Implement caching for frequently accessed data
6. **Resolve Type Casting**: Remove the need for type casting by updating all classes to use interfaces
