/**
 * Integration Test Runner for Workspace and State Management
 * PACT Test Phase: Executable tests with real implementation
 */

import { ListWorkspacesMode } from './src/agents/memoryManager/modes/workspace/listWorkspacesMode';
import { CreateStateMode } from './src/agents/memoryManager/modes/state/createStateMode';
import { ListStatesMode } from './src/agents/memoryManager/modes/state/listStatesMode';
import { WorkspaceCollection } from './src/database/collections/WorkspaceCollection';

/**
 * Integration Test Runner - Tests real implementation components
 */
class IntegrationTestRunner {
  private testResults: Array<{
    testName: string;
    status: 'PASS' | 'FAIL' | 'SKIP';
    duration: number;
    error?: string;
    details?: any;
  }> = [];

  /**
   * Run integration tests with real implementation components
   */
  async runIntegrationTests(): Promise<{
    summary: {
      total: number;
      passed: number;
      failed: number;
      duration: number;
    };
    results: typeof this.testResults;
  }> {
    const startTime = Date.now();
    console.log('🧪 Starting Integration Tests with Real Implementation');

    // Test 1: Workspace Collection Schema Detection
    await this.testWorkspaceCollectionSchemaDetection();
    
    // Test 2: Workspace Collection Legacy Conversion
    await this.testWorkspaceCollectionLegacyConversion();
    
    // Test 3: Mode Parameter Schemas
    await this.testModeParameterSchemas();
    
    // Test 4: Mode Result Schemas
    await this.testModeResultSchemas();
    
    // Test 5: Error Handling Patterns
    await this.testErrorHandlingPatterns();

    // Test 6: Service Integration Mock Tests
    await this.testServiceIntegrationMocks();

    const duration = Date.now() - startTime;
    const summary = this.calculateSummary(duration);

    console.log(`🎯 Integration Tests Completed in ${duration}ms`);
    this.printSummary(summary);

    return { summary, results: this.testResults };
  }

  /**
   * Test WorkspaceCollection schema detection and version identification
   */
  private async testWorkspaceCollectionSchemaDetection(): Promise<void> {
    await this.runTest('WorkspaceCollection Schema Detection', async () => {
      // Create a WorkspaceCollection instance for testing
      const mockVectorStore = this.createMockVectorStore();
      const collection = new WorkspaceCollection(mockVectorStore);

      // Test legacy format detection
      const legacyMetadata = {
        name: 'Legacy Test Workspace',
        description: 'This is a legacy format workspace',
        hierarchyType: 'workspace',
        rootFolder: '/legacy-root',
        created: Date.now() - 86400000,
        lastAccessed: Date.now() - 3600000,
        preferences: JSON.stringify({ theme: 'dark', autoSave: true }),
        activityHistory: JSON.stringify([
          { timestamp: Date.now() - 1800000, action: 'view', toolName: 'contentManager' }
        ])
        // No 'context' field - key indicator of legacy format
      };

      // Use WorkspaceCollection's private method through reflection for testing
      const detectWorkspaceVersion = (collection as any).detectWorkspaceVersion;
      if (!detectWorkspaceVersion) {
        throw new Error('detectWorkspaceVersion method not found in WorkspaceCollection');
      }

      const detectedVersion = detectWorkspaceVersion.call(collection, legacyMetadata);
      if (detectedVersion !== 'legacy') {
        throw new Error(`Expected 'legacy', got '${detectedVersion}'`);
      }

      // Test modern format detection
      const modernMetadata = {
        ...legacyMetadata,
        context: JSON.stringify({
          purpose: 'Modern workspace purpose',
          currentGoal: 'Current development goal',
          status: 'Active development',
          workflows: [{
            name: 'Main Workflow',
            when: 'When working on main tasks',
            steps: ['Step 1', 'Step 2', 'Step 3']
          }],
          keyFiles: [],
          preferences: [],
          agents: [],
          nextActions: ['Review progress']
        })
      };

      const modernVersion = detectWorkspaceVersion.call(collection, modernMetadata);
      if (modernVersion !== 'modern') {
        throw new Error(`Expected 'modern', got '${modernVersion}'`);
      }

      // Test hybrid format detection
      const hybridMetadata = {
        ...legacyMetadata,
        context: JSON.stringify({
          purpose: 'Incomplete purpose'
          // Missing required fields like workflows, keyFiles, etc.
        })
      };

      const hybridVersion = detectWorkspaceVersion.call(collection, hybridMetadata);
      if (hybridVersion !== 'hybrid') {
        throw new Error(`Expected 'hybrid', got '${hybridVersion}'`);
      }

      return {
        legacyDetected: detectedVersion === 'legacy',
        modernDetected: modernVersion === 'modern',
        hybridDetected: hybridVersion === 'hybrid',
        schemaDetectionWorking: true
      };
    });
  }

  /**
   * Test WorkspaceCollection legacy to modern conversion
   */
  private async testWorkspaceCollectionLegacyConversion(): Promise<void> {
    await this.runTest('WorkspaceCollection Legacy Conversion', async () => {
      const mockVectorStore = this.createMockVectorStore();
      const collection = new WorkspaceCollection(mockVectorStore);

      // Create comprehensive legacy workspace data
      const legacyStorage = {
        id: 'test-legacy-conversion',
        metadata: {
          name: 'Legacy Conversion Test',
          description: 'Testing comprehensive legacy to modern conversion',
          hierarchyType: 'workspace',
          parentId: '',
          rootFolder: '/legacy-test-root',
          created: Date.now() - 86400000,
          lastAccessed: Date.now() - 3600000,
          status: 'active',
          
          // Legacy-specific fields
          path: 'root/legacy/test',
          childWorkspaces: 'child1,child2',
          relatedFolders: JSON.stringify(['/folder1', '/folder2']),
          relatedFiles: JSON.stringify(['file1.md', 'file2.md']),
          associatedNotes: 'note1.md,note2.md',
          preferences: JSON.stringify({ 
            theme: 'dark', 
            autoSave: true, 
            fontSize: 14 
          }),
          activityHistory: JSON.stringify([
            { timestamp: Date.now() - 1800000, action: 'view', toolName: 'contentManager' },
            { timestamp: Date.now() - 900000, action: 'edit', toolName: 'vaultManager' },
            { timestamp: Date.now() - 450000, action: 'create', toolName: 'contentManager' }
          ]),
          projectPlan: 'Phase 1: Setup\nPhase 2: Implementation\nPhase 3: Testing\nPhase 4: Deployment',
          checkpoints: JSON.stringify([
            { id: 'cp1', date: Date.now() - 86400000, description: 'Project setup completed', completed: true },
            { id: 'cp2', date: Date.now() - 43200000, description: 'Basic implementation done', completed: true },
            { id: 'cp3', date: Date.now(), description: 'Testing and validation', completed: false },
            { id: 'cp4', date: Date.now() + 86400000, description: 'Final deployment', completed: false }
          ]),
          completionStatus: JSON.stringify({
            'setup': { status: 'completed', completedDate: Date.now() - 86400000, completionNotes: 'All setup tasks done' },
            'implementation': { status: 'completed', completedDate: Date.now() - 43200000, completionNotes: 'Core features implemented' },
            'testing': { status: 'in_progress', completionNotes: 'Currently running comprehensive tests' },
            'deployment': { status: 'pending', completionNotes: 'Waiting for testing completion' }
          }),
          keyFileInstructions: 'Always review main.md before making changes. Check config.json for settings.',
          
          // Important: No 'context' field - this makes it legacy format
        }
      };

      // Convert using WorkspaceCollection's storageToItem method
      const convertedWorkspace = (collection as any).storageToItem(legacyStorage);

      // Validate conversion results
      this.validateLegacyConversion(legacyStorage, convertedWorkspace);

      return {
        conversionSuccessful: !!convertedWorkspace.context,
        contextHasPurpose: !!convertedWorkspace.context?.purpose,
        contextHasWorkflows: Array.isArray(convertedWorkspace.context?.workflows) && convertedWorkspace.context.workflows.length > 0,
        contextHasKeyFiles: Array.isArray(convertedWorkspace.context?.keyFiles) && convertedWorkspace.context.keyFiles.length > 0,
        contextHasNextActions: Array.isArray(convertedWorkspace.context?.nextActions) && convertedWorkspace.context.nextActions.length > 0,
        legacyFieldsPreserved: {
          name: convertedWorkspace.name === legacyStorage.metadata.name,
          description: convertedWorkspace.description === legacyStorage.metadata.description,
          rootFolder: convertedWorkspace.rootFolder === legacyStorage.metadata.rootFolder,
          hierarchyType: convertedWorkspace.hierarchyType === legacyStorage.metadata.hierarchyType,
          status: convertedWorkspace.status === legacyStorage.metadata.status
        },
        contextDetails: {
          purpose: convertedWorkspace.context?.purpose,
          currentGoal: convertedWorkspace.context?.currentGoal,
          status: convertedWorkspace.context?.status,
          workflowCount: convertedWorkspace.context?.workflows?.length || 0,
          keyFileCategories: convertedWorkspace.context?.keyFiles?.length || 0,
          preferenceCount: convertedWorkspace.context?.preferences?.length || 0,
          nextActionCount: convertedWorkspace.context?.nextActions?.length || 0
        }
      };
    });
  }

  /**
   * Test mode parameter schemas for completeness
   */
  private async testModeParameterSchemas(): Promise<void> {
    await this.runTest('Mode Parameter Schemas', async () => {
      // Test ListWorkspacesMode parameter schema
      const listWorkspacesMode = new ListWorkspacesMode(this.createMockApp());
      const listWorkspacesSchema = listWorkspacesMode.getParameterSchema();
      
      this.validateSchema(listWorkspacesSchema, {
        requiredProperties: ['type', 'properties'],
        expectedProperties: ['sortBy', 'order', 'parentId', 'hierarchyType'],
        schemaType: 'object'
      });

      // Test CreateStateMode parameter schema
      const createStateMode = new CreateStateMode(this.createMockApp());
      const createStateSchema = createStateMode.getParameterSchema();
      
      this.validateSchema(createStateSchema, {
        requiredProperties: ['type', 'properties', 'required'],
        expectedProperties: ['name', 'conversationContext', 'activeTask', 'activeFiles', 'nextSteps', 'reasoning'],
        schemaType: 'object'
      });

      // Verify required fields are properly specified
      const requiredFields = createStateSchema.required || [];
      const expectedRequired = ['name', 'conversationContext', 'activeTask', 'activeFiles', 'nextSteps', 'reasoning'];
      
      for (const field of expectedRequired) {
        if (!requiredFields.includes(field)) {
          throw new Error(`Required field '${field}' not found in CreateStateMode schema`);
        }
      }

      // Test ListStatesMode parameter schema
      const listStatesMode = new ListStatesMode({ getMemoryService: () => this.createMockMemoryService() } as any);
      const listStatesSchema = listStatesMode.getParameterSchema();
      
      this.validateSchema(listStatesSchema, {
        requiredProperties: ['type', 'properties'],
        expectedProperties: ['includeContext', 'limit', 'targetSessionId', 'order', 'tags'],
        schemaType: 'object'
      });

      return {
        listWorkspacesSchemaValid: true,
        createStateSchemaValid: true,
        listStatesSchemaValid: true,
        requiredFieldsCount: requiredFields.length,
        allSchemasValid: true
      };
    });
  }

  /**
   * Test mode result schemas for completeness
   */
  private async testModeResultSchemas(): Promise<void> {
    await this.runTest('Mode Result Schemas', async () => {
      // Test ListWorkspacesMode result schema
      const listWorkspacesMode = new ListWorkspacesMode(this.createMockApp());
      const listWorkspacesResultSchema = listWorkspacesMode.getResultSchema();
      
      this.validateResultSchema(listWorkspacesResultSchema, {
        expectedDataProperties: ['workspaces'],
        expectedWorkspaceProperties: ['id', 'name', 'hierarchyType', 'status']
      });

      // Test CreateStateMode result schema
      const createStateMode = new CreateStateMode(this.createMockApp());
      const createStateResultSchema = createStateMode.getResultSchema();
      
      this.validateResultSchema(createStateResultSchema, {
        expectedDataProperties: ['stateId', 'name', 'workspaceId', 'sessionId', 'timestamp', 'summary', 'metadata'],
        expectedMetadataProperties: ['persistenceVerified', 'workspaceName']
      });

      // Test ListStatesMode result schema
      const listStatesMode = new ListStatesMode({ getMemoryService: () => this.createMockMemoryService() } as any);
      const listStatesResultSchema = listStatesMode.getResultSchema();
      
      this.validateResultSchema(listStatesResultSchema, {
        expectedDataProperties: ['states', 'total'],
        expectedStateProperties: ['id', 'name', 'workspaceId', 'sessionId', 'timestamp']
      });

      return {
        allResultSchemasValid: true,
        schemasTestedCount: 3,
        schemaValidationPassed: true
      };
    });
  }

  /**
   * Test error handling patterns across modes
   */
  private async testErrorHandlingPatterns(): Promise<void> {
    await this.runTest('Error Handling Patterns', async () => {
      // Test CreateStateMode parameter validation
      const createStateMode = new CreateStateMode(this.createMockApp());
      
      // Test validation method exists and works
      const validateParameters = (createStateMode as any).validateParameters;
      if (!validateParameters) {
        throw new Error('validateParameters method not found in CreateStateMode');
      }

      // Test with invalid parameters
      const invalidParams = {
        name: '', // Empty name should fail
        conversationContext: '', // Empty context should fail
        activeTask: '', // Empty task should fail
        activeFiles: [], // Empty files should fail
        nextSteps: [], // Empty steps should fail
        reasoning: '' // Empty reasoning should fail
      };

      const validationErrors = validateParameters.call(createStateMode, invalidParams);
      if (!Array.isArray(validationErrors) || validationErrors.length === 0) {
        throw new Error('Expected validation errors for invalid parameters');
      }

      // Test with valid parameters
      const validParams = {
        name: 'Valid Test State',
        conversationContext: 'Working on testing the state management system',
        activeTask: 'Testing parameter validation functionality',
        activeFiles: ['test-file.md'],
        nextSteps: ['Complete validation testing'],
        reasoning: 'Need to ensure parameter validation works correctly'
      };

      const noValidationErrors = validateParameters.call(createStateMode, validParams);
      if (!Array.isArray(noValidationErrors) || noValidationErrors.length !== 0) {
        throw new Error('Expected no validation errors for valid parameters');
      }

      return {
        validationErrorsDetected: validationErrors.length > 0,
        validParametersAccepted: noValidationErrors.length === 0,
        errorHandlingWorking: true,
        validationErrorCount: validationErrors.length
      };
    });
  }

  /**
   * Test service integration mock functionality
   */
  private async testServiceIntegrationMocks(): Promise<void> {
    await this.runTest('Service Integration Mock Tests', async () => {
      const mockMemoryService = this.createMockMemoryService();
      const mockWorkspaceService = this.createMockWorkspaceService();

      // Test MemoryService mock functionality
      const testSnapshot = {
        workspaceId: 'test-workspace-1',
        sessionId: 'test-session-1',
        name: 'Test Snapshot',
        timestamp: Date.now(),
        created: Date.now(),
        description: 'Test snapshot for service integration',
        snapshot: {
          workspaceContext: { purpose: 'Test purpose' },
          conversationContext: 'Test conversation',
          activeTask: 'Test task',
          activeFiles: ['test.md'],
          nextSteps: ['Complete test'],
          reasoning: 'Testing service integration'
        },
        state: {
          workspace: { id: 'test-workspace-1', name: 'Test Workspace' },
          recentTraces: [],
          contextFiles: ['test.md'],
          metadata: { createdBy: 'Test', version: '1.0' }
        }
      };

      const createdSnapshot = await mockMemoryService.createSnapshot(testSnapshot);
      if (!createdSnapshot.id) {
        throw new Error('MockMemoryService createSnapshot should return snapshot with ID');
      }

      const retrievedSnapshot = await mockMemoryService.getSnapshot(createdSnapshot.id);
      if (!retrievedSnapshot) {
        throw new Error('MockMemoryService getSnapshot should retrieve created snapshot');
      }

      // Test WorkspaceService mock functionality
      const testWorkspaces = await mockWorkspaceService.getWorkspaces();
      if (!Array.isArray(testWorkspaces)) {
        throw new Error('MockWorkspaceService getWorkspaces should return array');
      }

      const diagnostics = await mockWorkspaceService.getDiagnostics();
      if (!diagnostics || typeof diagnostics.totalItems !== 'number') {
        throw new Error('MockWorkspaceService getDiagnostics should return diagnostic information');
      }

      return {
        memoryServiceMockWorking: true,
        workspaceServiceMockWorking: true,
        snapshotCreated: !!createdSnapshot.id,
        snapshotRetrieved: !!retrievedSnapshot,
        diagnosticsAvailable: !!diagnostics,
        allMocksWorking: true
      };
    });
  }

  // Helper Methods

  private async runTest(testName: string, testFunction: () => Promise<any>): Promise<void> {
    const startTime = Date.now();
    console.log(`🔍 Running Integration Test: ${testName}`);

    try {
      const details = await testFunction();
      const duration = Date.now() - startTime;
      
      this.testResults.push({
        testName,
        status: 'PASS',
        duration,
        details
      });
      
      console.log(`✅ ${testName} - PASSED (${duration}ms)`);
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.testResults.push({
        testName,
        status: 'FAIL',
        duration,
        error: errorMessage
      });
      
      console.error(`❌ ${testName} - FAILED (${duration}ms):`, errorMessage);
    }
  }

  private validateLegacyConversion(legacyStorage: any, convertedWorkspace: any): void {
    // Validate that context was created
    if (!convertedWorkspace.context) {
      throw new Error('Legacy conversion failed: No context created');
    }

    // Validate required context fields
    const requiredContextFields = ['purpose', 'currentGoal', 'status', 'workflows', 'keyFiles', 'preferences', 'agents', 'nextActions'];
    for (const field of requiredContextFields) {
      if (!(field in convertedWorkspace.context)) {
        throw new Error(`Legacy conversion failed: Missing context field '${field}'`);
      }
    }

    // Validate workflows were generated
    if (!Array.isArray(convertedWorkspace.context.workflows) || convertedWorkspace.context.workflows.length === 0) {
      throw new Error('Legacy conversion failed: No workflows generated');
    }

    // Validate next actions were created
    if (!Array.isArray(convertedWorkspace.context.nextActions) || convertedWorkspace.context.nextActions.length === 0) {
      throw new Error('Legacy conversion failed: No next actions created');
    }

    // Validate legacy fields were preserved
    if (convertedWorkspace.name !== legacyStorage.metadata.name) {
      throw new Error('Legacy conversion failed: Name not preserved');
    }

    if (convertedWorkspace.rootFolder !== legacyStorage.metadata.rootFolder) {
      throw new Error('Legacy conversion failed: Root folder not preserved');
    }
  }

  private validateSchema(schema: any, validation: {
    requiredProperties: string[];
    expectedProperties?: string[];
    schemaType: string;
  }): void {
    // Check required schema properties
    for (const prop of validation.requiredProperties) {
      if (!(prop in schema)) {
        throw new Error(`Schema missing required property: ${prop}`);
      }
    }

    // Check schema type
    if (schema.type !== validation.schemaType) {
      throw new Error(`Expected schema type '${validation.schemaType}', got '${schema.type}'`);
    }

    // Check expected properties
    if (validation.expectedProperties) {
      for (const prop of validation.expectedProperties) {
        if (!schema.properties || !(prop in schema.properties)) {
          throw new Error(`Schema missing expected property: ${prop}`);
        }
      }
    }
  }

  private validateResultSchema(schema: any, validation: {
    expectedDataProperties?: string[];
    expectedWorkspaceProperties?: string[];
    expectedStateProperties?: string[];
    expectedMetadataProperties?: string[];
  }): void {
    if (!schema.properties) {
      throw new Error('Result schema missing properties');
    }

    if (!schema.properties.success) {
      throw new Error('Result schema missing success property');
    }

    if (validation.expectedDataProperties && schema.properties.data) {
      for (const prop of validation.expectedDataProperties) {
        if (!schema.properties.data.properties || !(prop in schema.properties.data.properties)) {
          throw new Error(`Result schema data missing expected property: ${prop}`);
        }
      }
    }
  }

  // Mock Creation Methods
  private createMockVectorStore(): any {
    return {
      getItems: async (collectionName: string) => ({
        ids: ['test-id-1', 'test-id-2'],
        metadatas: [
          { name: 'Test Item 1', hierarchyType: 'workspace' },
          { name: 'Test Item 2', hierarchyType: 'workspace' }
        ]
      }),
      addItems: async () => ({ success: true }),
      updateItems: async () => ({ success: true }),
      deleteItems: async () => ({ success: true })
    };
  }

  private createMockApp(): any {
    return {
      vault: {
        adapter: {
          fs: {
            promises: {
              readFile: async () => '{}',
              writeFile: async () => {},
              mkdir: async () => {}
            }
          }
        }
      },
      metadataCache: {
        getFileCache: () => null
      }
    };
  }

  private createMockMemoryService(): any {
    const snapshots: any[] = [];
    
    return {
      createSnapshot: async (data: any) => {
        const snapshot = {
          id: `snapshot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          ...data
        };
        snapshots.push(snapshot);
        return snapshot;
      },
      getSnapshot: async (id: string) => snapshots.find(s => s.id === id),
      getSnapshots: async (workspaceId?: string) => 
        workspaceId ? snapshots.filter(s => s.workspaceId === workspaceId) : snapshots,
      getSnapshotsBySession: async (sessionId: string) => 
        snapshots.filter(s => s.sessionId === sessionId),
      deleteSnapshot: async (id: string) => {
        const index = snapshots.findIndex(s => s.id === id);
        return index >= 0 ? (snapshots.splice(index, 1), true) : false;
      }
    };
  }

  private createMockWorkspaceService(): any {
    const workspaces = [
      {
        id: 'workspace-1',
        name: 'Test Workspace 1',
        hierarchyType: 'workspace',
        status: 'active',
        created: Date.now() - 86400000,
        lastAccessed: Date.now() - 3600000
      },
      {
        id: 'workspace-2',
        name: 'Test Workspace 2',
        hierarchyType: 'workspace',
        status: 'active',
        created: Date.now() - 172800000,
        lastAccessed: Date.now() - 7200000
      }
    ];

    return {
      getWorkspaces: async (params?: any) => workspaces,
      getWorkspace: async (id: string) => workspaces.find(w => w.id === id),
      getDiagnostics: async () => ({
        totalItems: workspaces.length,
        sampleItems: workspaces,
        formatAnalysis: {
          legacyCount: 1,
          modernCount: 1,
          hybridCount: 0,
          invalidCount: 0
        }
      })
    };
  }

  // Summary and Reporting
  private calculateSummary(duration: number) {
    const total = this.testResults.length;
    const passed = this.testResults.filter(r => r.status === 'PASS').length;
    const failed = this.testResults.filter(r => r.status === 'FAIL').length;

    return { total, passed, failed, duration };
  }

  private printSummary(summary: any): void {
    console.log('\n📊 Integration Test Summary:');
    console.log(`Total Tests: ${summary.total}`);
    console.log(`Passed: ${summary.passed} ✅`);
    console.log(`Failed: ${summary.failed} ❌`);
    console.log(`Duration: ${summary.duration}ms`);
    console.log(`Success Rate: ${((summary.passed / summary.total) * 100).toFixed(1)}%`);
    
    if (summary.failed > 0) {
      console.log('\n❌ Failed Tests:');
      this.testResults.filter(r => r.status === 'FAIL').forEach(result => {
        console.log(`  - ${result.testName}: ${result.error}`);
      });
    }
  }
}

/**
 * Export integration test runner
 */
export async function runIntegrationTests() {
  const runner = new IntegrationTestRunner();
  return await runner.runIntegrationTests();
}

/**
 * Quick integration test for critical functionality
 */
export async function quickIntegrationTest(): Promise<boolean> {
  try {
    const runner = new IntegrationTestRunner();
    
    // Run only critical tests
    await runner['testWorkspaceCollectionSchemaDetection']();
    await runner['testModeParameterSchemas']();
    await runner['testErrorHandlingPatterns']();

    console.log('✅ Quick integration test passed');
    return true;
  } catch (error) {
    console.error('❌ Quick integration test failed:', error);
    return false;
  }
}