import { ServiceContainer, ServiceLifetime } from '@/fw/di';
import { ResourceManager } from '@/services/ResourceManager';
import {
  AssetLoader,
  SceneLoader,
  SceneManager,
  SceneSaver,
  ScriptRegistry,
} from '@pix3/runtime';

/**
 * Wrappers for Runtime classes to allow DI container instantiation.
 * The DI container expects parameterless constructors for service implementation classes.
 */

class EditorAssetLoader extends AssetLoader {
  constructor() {
    const container = ServiceContainer.getInstance();
    super(container.getService<ResourceManager>(container.getOrCreateToken(ResourceManager)));
  }
}

class EditorSceneLoader extends SceneLoader {
  constructor() {
    // Resolve dependencies manually
    const container = ServiceContainer.getInstance();
    
    // We cannot use await here as constructor is synchronous.
    // DI services must be available.
    
    // We get ScriptRegistry token from class
    const scriptRegistryToken = container.getOrCreateToken(ScriptRegistry);
    const scriptRegistry = container.getService<ScriptRegistry>(scriptRegistryToken);
    
    // We get AssetLoader token from class - resolving to EditorAssetLoader
    const assetLoaderToken = container.getOrCreateToken(AssetLoader);
    const assetLoader = container.getService<AssetLoader>(assetLoaderToken);
    
    super(assetLoader, scriptRegistry);
  }
}

class EditorSceneManager extends SceneManager {
  constructor() {
    const container = ServiceContainer.getInstance();
    
    const loaderToken = container.getOrCreateToken(SceneLoader);
    const loader = container.getService<SceneLoader>(loaderToken);
    
    const saverToken = container.getOrCreateToken(SceneSaver);
    const saver = container.getService<SceneSaver>(saverToken);
    
    super(loader, saver);
  }
}

export function registerRuntimeServices(): void {
  const container = ServiceContainer.getInstance();

  // 1. ScriptRegistry (No dependencies)
  container.addService(
    container.getOrCreateToken(ScriptRegistry),
    ScriptRegistry,
    ServiceLifetime.Singleton
  );

  // 2. AssetLoader (Depends on ResourceManager)
  // Register EditorAssetLoader as implementation for AssetLoader interface/token
  container.addService(
    container.getOrCreateToken(AssetLoader),
    EditorAssetLoader,
    ServiceLifetime.Singleton
  );

  // 3. SceneSaver (No dependencies)
  container.addService(
    container.getOrCreateToken(SceneSaver),
    SceneSaver,
    ServiceLifetime.Singleton
  );

  // 4. SceneLoader (Depends on AssetLoader, ScriptRegistry)
  container.addService(
    container.getOrCreateToken(SceneLoader),
    EditorSceneLoader,
    ServiceLifetime.Singleton
  );

  // 5. SceneManager (Depends on SceneLoader, SceneSaver)
  container.addService(
    container.getOrCreateToken(SceneManager),
    EditorSceneManager,
    ServiceLifetime.Singleton
  );

  console.log('[Pix3] Runtime services registered');
}
