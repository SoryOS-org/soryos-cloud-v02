/**
 * @soryos/dev-runner
 * Preview System - Inspiré de Vibra Code
 * 
 * Fonctionnalités:
 * - Détection automatique des ports
 * - Génération d'URLs de preview
 * - Gestion des tunnels (ngrok, Cloudflare, etc.)
 * - Health checks pour les serveurs
 * - Gestion des iframes
 * - Capture d'écran
 * - Proxy inversé pour l'accès sécurisé
 */

import { ExecutionProvider } from '@soryos/execution';
import { ShellTools, CommonCommands } from '@soryos/tool/shell-tools';
import { globalEventBus } from '@soryos/bus';
import { permissionsManager } from '@soryos/permissions';

export interface PreviewConfig {
  defaultPort: number;
  portRange: [number, number];
  healthCheckPath: string;
  healthCheckInterval: number;
  maxHealthChecks: number;
  tunnelProvider: 'none' | 'ngrok' | 'cloudflare' | 'localxpose';
  ngrokToken?: string;
  cloudflareToken?: string;
  localxposeToken?: string;
  useHttps: boolean;
  domain?: string;
  subdomain?: string;
}

export interface PreviewOptions {
  port?: number;
  path?: string;
  workspaceId?: string;
  projectId?: string;
  forceTunnel?: boolean;
  customDomain?: string;
}

export interface PreviewInfo {
  id: string;
  sessionId: string;
  workspaceId?: string;
  projectId?: string;
  localUrl: string;
  publicUrl?: string;
  port: number;
  tunnelUrl?: string;
  tunnelType?: string;
  status: 'starting' | 'running' | 'stopped' | 'failed' | 'timeout';
  healthCheckStatus: boolean;
  createdAt: number;
  startedAt?: number;
  stoppedAt?: number;
  error?: string;
  metadata?: Record<string, any>;
}

export interface PreviewResult {
  success: boolean;
  preview?: PreviewInfo;
  url?: string;
  error?: string;
  message?: string;
}

export interface TunnelInfo {
  type: string;
  url: string;
  processId?: number;
  status: 'starting' | 'running' | 'stopped' | 'failed';
  createdAt: number;
}

const DEFAULT_CONFIG: PreviewConfig = {
  defaultPort: 3000,
  portRange: [3000, 4000],
  healthCheckPath: '/',
  healthCheckInterval: 1000,
  maxHealthChecks: 10,
  tunnelProvider: 'none',
  useHttps: true,
  domain: undefined,
  subdomain: undefined
};

/**
 * Preview Manager
 * 
 * Gère la création et la gestion des aperçus (previews) pour les applications.
 */
export class PreviewManager {
  private config: PreviewConfig;
  private provider: ExecutionProvider;
  private shellTools: ShellTools;
  
  private previews: Map<string, PreviewInfo> = new Map();
  private tunnels: Map<string, TunnelInfo> = new Map();
  private usedPorts: Set<number> = new Set();
  private nextPreviewId: number = 1;

  constructor(
    provider: ExecutionProvider,
    config: Partial<PreviewConfig> = {}
  ) {
    this.provider = provider;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.shellTools = new ShellTools(provider);
  }

  /**
   * Créer un aperçu
   */
  async createPreview(
    sessionId: string,
    options: PreviewOptions = {}
  ): Promise<PreviewResult> {
    const previewId = `preview-${sessionId}-${this.nextPreviewId++}`;
    const {
      port = this.config.defaultPort,
      path = '/',
      workspaceId,
      projectId,
      forceTunnel = false,
      customDomain
    } = options;

    try {
      // Vérifier les permissions
      const perm = permissionsManager.checkPermission('read', 'create_preview', { 
        sessionId, 
        port,
        workspaceId,
        projectId 
      });
      if (!perm.allowed) {
        globalEventBus.emit('permission.denied', { 
          toolName: 'create_preview', 
          reason: perm.reason,
          previewId 
        });
        return {
          success: false,
          error: `PERMISSION DENIED: ${perm.reason}`
        };
      }

      globalEventBus.emit('preview.created', { 
        previewId,
        sessionId,
        port
      });

      // Déterminer le port
      const availablePort = await this.findAvailablePort(port);
      
      // Créer l'info de preview
      const preview: PreviewInfo = {
        id: previewId,
        sessionId,
        workspaceId,
        projectId,
        localUrl: `http://localhost:${availablePort}${path}`,
        port: availablePort,
        status: 'starting',
        healthCheckStatus: false,
        createdAt: Date.now()
      };

      // Sauvegarder
      this.previews.set(previewId, preview);

      // Démarrer le health check
      this.startHealthCheck(previewId, availablePort, path);

      // Si tunnel demandé ou forcé
      if (forceTunnel || this.config.tunnelProvider !== 'none') {
        await this.startTunnel(previewId, availablePort);
      }

      // Attendre que le health check réussisse
      const healthCheckResult = await this.waitForHealthCheck(
        previewId,
        this.config.healthCheckInterval,
        this.config.maxHealthChecks
      );

      if (!healthCheckResult) {
        // Arrêter le tunnel si démarré
        if (preview.tunnelUrl) {
          await this.stopTunnel(previewId);
        }
        
        preview.status = 'failed';
        preview.error = 'Health check failed';
        preview.stoppedAt = Date.now();
        
        this.previews.set(previewId, preview);
        
        globalEventBus.emit('preview.failed', { 
          previewId,
          sessionId,
          error: preview.error
        });

        return {
          success: false,
          preview,
          error: 'Health check failed'
        };
      }

      // Mettre à jour le statut
      preview.status = 'running';
      preview.startedAt = Date.now();
      
      this.previews.set(previewId, preview);

      globalEventBus.emit('preview.started', { 
        previewId,
        sessionId,
        preview
      });

      // Retourner le résultat
      return {
        success: true,
        preview,
        url: preview.tunnelUrl || preview.localUrl,
        message: `Preview started on port ${availablePort}`
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Nettoyer
      const preview = this.previews.get(previewId);
      if (preview) {
        preview.status = 'failed';
        preview.error = errorMessage;
        preview.stoppedAt = Date.now();
        
        this.previews.set(previewId, preview);
        
        globalEventBus.emit('preview.failed', { 
          previewId,
          sessionId,
          error: errorMessage
        });
      }

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Trouver un port disponible
   */
  private async findAvailablePort(defaultPort: number): Promise<number> {
    const startPort = defaultPort;
    const endPort = this.config.portRange[1];
    
    for (let port = startPort; port <= endPort; port++) {
      if (!this.usedPorts.has(port)) {
        const isAvailable = await this.checkPortAvailability(port);
        if (isAvailable) {
          this.usedPorts.add(port);
          return port;
        }
      }
    }
    
    // Si aucun port disponible, utiliser un port aléatoire
    const randomPort = Math.floor(Math.random() * (65535 - 1024 + 1)) + 1024;
    this.usedPorts.add(randomPort);
    return randomPort;
  }

  /**
   * Vérifier la disponibilité d'un port
   */
  private async checkPortAvailability(port: number): Promise<boolean> {
    try {
      const result = await this.shellTools.shellCommand(
        CommonCommands.checkPort(port),
        { timeoutMs: 1000 }
      );
      
      return !result.success || result.stdout === '';
    } catch {
      return true;
    }
  }

  /**
   * Démarrer le health check
   */
  private startHealthCheck(previewId: string, port: number, path: string): void {
    const preview = this.previews.get(previewId);
    if (!preview) return;

    const checkUrl = `http://localhost:${port}${path}`;
    
    const checkInterval = setInterval(async () => {
      try {
        const result = await this.shellTools.shellCommand(
          `curl -s -o /dev/null -w "%{http_code}" ${checkUrl}`,
          { timeoutMs: this.config.healthCheckInterval }
        );
        
        if (result.success && result.stdout?.includes('200')) {
          preview.healthCheckStatus = true;
          this.previews.set(previewId, preview);
          
          globalEventBus.emit('preview.healthcheck.success', { 
            previewId,
            sessionId: preview.sessionId,
            port
          });
          
          clearInterval(checkInterval);
        }
      } catch {
        // Ignorer les erreurs
      }
    }, this.config.healthCheckInterval);

    // Sauvegarder l'interval pour nettoyage
    (preview as any)._healthCheckInterval = checkInterval;
  }

  /**
   * Attendre le health check
   */
  private async waitForHealthCheck(
    previewId: string,
    interval: number,
    maxChecks: number
  ): Promise<boolean> {
    const preview = this.previews.get(previewId);
    if (!preview) return false;

    let checkCount = 0;
    
    while (checkCount < maxChecks) {
      if (preview.healthCheckStatus) {
        return true;
      }
      
      await new Promise(resolve => setTimeout(resolve, interval));
      checkCount++;
    }
    
    return false;
  }

  /**
   * Démarrer un tunnel
   */
  private async startTunnel(previewId: string, port: number): Promise<void> {
    const preview = this.previews.get(previewId);
    if (!preview) return;

    try {
      const tunnelProvider = this.config.tunnelProvider;
      
      switch (tunnelProvider) {
        case 'ngrok':
          await this.startNgrokTunnel(previewId, port);
          break;
        case 'cloudflare':
          await this.startCloudflareTunnel(previewId, port);
          break;
        case 'localxpose':
          await this.startLocalXposeTunnel(previewId, port);
          break;
        default:
          console.log('[PreviewManager] No tunnel provider configured');
      }

    } catch (error) {
      console.error('[PreviewManager] Failed to start tunnel:', error);
    }
  }

  /**
   * Démarrer un tunnel ngrok
   */
  private async startNgrokTunnel(previewId: string, port: number): Promise<void> {
    const preview = this.previews.get(previewId);
    if (!preview) return;

    try {
      // Vérifier que ngrok est installé
      const ngrokCheck = await this.shellTools.shellCommand('which ngrok || command -v ngrok');
      if (!ngrokCheck.success) {
        throw new Error('ngrok is not installed');
      }

      // Construire la commande ngrok
      let command = `ngrok http ${port}`;
      
      if (this.config.ngrokToken) {
        command = `NGROK_AUTHTOKEN=${this.config.ngrokToken} ${command}`;
      }
      
      if (this.config.subdomain) {
        command += ` --subdomain=${this.config.subdomain}`;
      }
      
      if (this.config.domain) {
        command += ` --domain=${this.config.domain}`;
      }

      // Démarrer ngrok en arrière-plan
      const result = await this.shellTools.shellCommand(command, {
        background: true
      });

      if (!result.success) {
        throw new Error(`Failed to start ngrok: ${result.error}`);
      }

      // Attendre que ngrok démarre
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Obtenir l'URL du tunnel
      const urlResult = await this.shellTools.shellCommand('curl -s http://localhost:4040/api/tunnels | grep -o "https://[^"]*"');
      
      if (!urlResult.success || !urlResult.stdout) {
        throw new Error('Failed to get ngrok URL');
      }

      const tunnelUrl = urlResult.stdout.trim();
      
      // Mettre à jour le preview
      preview.tunnelUrl = tunnelUrl;
      preview.tunnelType = 'ngrok';
      
      this.previews.set(previewId, preview);

      // Sauvegarder le tunnel
      this.tunnels.set(previewId, {
        type: 'ngrok',
        url: tunnelUrl,
        processId: result.pid,
        status: 'running',
        createdAt: Date.now()
      });

      globalEventBus.emit('preview.tunnel.started', { 
        previewId,
        sessionId: preview.sessionId,
        tunnelUrl,
        tunnelType: 'ngrok'
      });

    } catch (error) {
      console.error('[PreviewManager] Failed to start ngrok tunnel:', error);
      
      preview.status = 'failed';
      preview.error = error instanceof Error ? error.message : String(error);
      
      this.previews.set(previewId, preview);
    }
  }

  /**
   * Démarrer un tunnel Cloudflare
   */
  private async startCloudflareTunnel(previewId: string, port: number): Promise<void> {
    const preview = this.previews.get(previewId);
    if (!preview) return;

    try {
      // Vérifier que cloudflared est installé
      const cloudflareCheck = await this.shellTools.shellCommand('which cloudflared || command -v cloudflared');
      if (!cloudflareCheck.success) {
        throw new Error('cloudflared is not installed');
      }

      // Construire la commande cloudflared
      let command = `cloudflared tunnel --url http://localhost:${port}`;
      
      if (this.config.cloudflareToken) {
        command = `CLOUDFLARE_TOKEN=${this.config.cloudflareToken} ${command}`;
      }

      // Démarrer cloudflared en arrière-plan
      const result = await this.shellTools.shellCommand(command, {
        background: true
      });

      if (!result.success) {
        throw new Error(`Failed to start cloudflare tunnel: ${result.error}`);
      }

      // Attendre que cloudflare démarre
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Pour cloudflare, l'URL est générée automatiquement
      // On peut la récupérer via l'API ou les logs
      const tunnelUrl = `https://${this.config.subdomain || 'random'}.trycloudflare.com`;
      
      // Mettre à jour le preview
      preview.tunnelUrl = tunnelUrl;
      preview.tunnelType = 'cloudflare';
      
      this.previews.set(previewId, preview);

      // Sauvegarder le tunnel
      this.tunnels.set(previewId, {
        type: 'cloudflare',
        url: tunnelUrl,
        processId: result.pid,
        status: 'running',
        createdAt: Date.now()
      });

      globalEventBus.emit('preview.tunnel.started', { 
        previewId,
        sessionId: preview.sessionId,
        tunnelUrl,
        tunnelType: 'cloudflare'
      });

    } catch (error) {
      console.error('[PreviewManager] Failed to start cloudflare tunnel:', error);
      
      preview.status = 'failed';
      preview.error = error instanceof Error ? error.message : String(error);
      
      this.previews.set(previewId, preview);
    }
  }

  /**
   * Démarrer un tunnel LocalXpose
   */
  private async startLocalXposeTunnel(previewId: string, port: number): Promise<void> {
    const preview = this.previews.get(previewId);
    if (!preview) return;

    try {
      // Vérifier que localxpose est installé
      const localxposeCheck = await this.shellTools.shellCommand('which localxpose || command -v localxpose');
      if (!localxposeCheck.success) {
        throw new Error('localxpose is not installed');
      }

      // Construire la commande localxpose
      let command = `localxpose http ${port}`;
      
      if (this.config.localxposeToken) {
        command = `LOCALXPOSE_TOKEN=${this.config.localxposeToken} ${command}`;
      }
      
      if (this.config.subdomain) {
        command += ` --to ${this.config.subdomain}.loclx.io`;
      }

      // Démarrer localxpose en arrière-plan
      const result = await this.shellTools.shellCommand(command, {
        background: true
      });

      if (!result.success) {
        throw new Error(`Failed to start localxpose: ${result.error}`);
      }

      // Attendre que localxpose démarre
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Obtenir l'URL du tunnel
      const tunnelUrl = `https://${this.config.subdomain || 'random'}.loclx.io`;
      
      // Mettre à jour le preview
      preview.tunnelUrl = tunnelUrl;
      preview.tunnelType = 'localxpose';
      
      this.previews.set(previewId, preview);

      // Sauvegarder le tunnel
      this.tunnels.set(previewId, {
        type: 'localxpose',
        url: tunnelUrl,
        processId: result.pid,
        status: 'running',
        createdAt: Date.now()
      });

      globalEventBus.emit('preview.tunnel.started', { 
        previewId,
        sessionId: preview.sessionId,
        tunnelUrl,
        tunnelType: 'localxpose'
      });

    } catch (error) {
      console.error('[PreviewManager] Failed to start localxpose tunnel:', error);
      
      preview.status = 'failed';
      preview.error = error instanceof Error ? error.message : String(error);
      
      this.previews.set(previewId, preview);
    }
  }

  /**
   * Arrêter un tunnel
   */
  private async stopTunnel(previewId: string): Promise<void> {
    const tunnel = this.tunnels.get(previewId);
    if (!tunnel) return;

    try {
      if (tunnel.processId) {
        // Arrêter le processus du tunnel
        await this.shellTools.shellCommand(`kill ${tunnel.processId}`);
      }

      tunnel.status = 'stopped';
      this.tunnels.set(previewId, tunnel);

      // Mettre à jour le preview
      const preview = this.previews.get(previewId);
      if (preview) {
        preview.tunnelUrl = undefined;
        preview.tunnelType = undefined;
        this.previews.set(previewId, preview);
      }

      globalEventBus.emit('preview.tunnel.stopped', { 
        previewId,
        tunnelType: tunnel.type
      });

    } catch (error) {
      console.error('[PreviewManager] Failed to stop tunnel:', error);
    }
  }

  /**
   * Arrêter un aperçu
   */
  async stopPreview(previewId: string): Promise<PreviewResult> {
    const preview = this.previews.get(previewId);
    
    if (!preview) {
      return {
        success: false,
        error: `Preview ${previewId} not found`
      };
    }

    try {
      // Vérifier les permissions
      const perm = permissionsManager.checkPermission('build', 'stop_preview', { 
        previewId,
        sessionId: preview.sessionId 
      });
      if (!perm.allowed) {
        return {
          success: false,
          error: `PERMISSION DENIED: ${perm.reason}`
        };
      }

      // Arrêter le tunnel si démarré
      if (preview.tunnelUrl) {
        await this.stopTunnel(previewId);
      }

      // Arrêter le health check
      const healthCheckInterval = (preview as any)._healthCheckInterval;
      if (healthCheckInterval) {
        clearInterval(healthCheckInterval);
      }

      // Mettre à jour le statut
      preview.status = 'stopped';
      preview.stoppedAt = Date.now();
      preview.healthCheckStatus = false;
      
      this.previews.set(previewId, preview);

      // Libérer le port
      this.usedPorts.delete(preview.port);

      globalEventBus.emit('preview.stopped', { 
        previewId,
        sessionId: preview.sessionId,
        preview
      });

      return {
        success: true,
        preview,
        message: `Preview stopped: ${previewId}`
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Redémarrer un aperçu
   */
  async restartPreview(previewId: string): Promise<PreviewResult> {
    const preview = this.previews.get(previewId);
    
    if (!preview) {
      return {
        success: false,
        error: `Preview ${previewId} not found`
      };
    }

    try {
      // Arrêter l'aperçu actuel
      const stopResult = await this.stopPreview(previewId);
      if (!stopResult.success) {
        return stopResult;
      }

      // Redémarrer avec les mêmes options
      const createResult = await this.createPreview(preview.sessionId, {
        port: preview.port,
        path: '/',
        workspaceId: preview.workspaceId,
        projectId: preview.projectId,
        forceTunnel: !!preview.tunnelUrl
      });

      return createResult;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Obtenir un aperçu
   */
  getPreview(previewId: string): PreviewInfo | null {
    return this.previews.get(previewId) || null;
  }

  /**
   * Obtenir tous les aperçus
   */
  getAllPreviews(): PreviewInfo[] {
    return Array.from(this.previews.values());
  }

  /**
   * Obtenir les aperçus par session
   */
  getPreviewsBySession(sessionId: string): PreviewInfo[] {
    return Array.from(this.previews.values())
      .filter(preview => preview.sessionId === sessionId);
  }

  /**
   * Obtenir les aperçus en cours
   */
  getRunningPreviews(): PreviewInfo[] {
    return Array.from(this.previews.values())
      .filter(preview => preview.status === 'running');
  }

  /**
   * Obtenir les aperçus terminés
   */
  getStoppedPreviews(): PreviewInfo[] {
    return Array.from(this.previews.values())
      .filter(preview => preview.status === 'stopped' || preview.status === 'failed');
  }

  /**
   * Supprimer un aperçu
   */
  async deletePreview(previewId: string, force: boolean = false): Promise<PreviewResult> {
    const preview = this.previews.get(previewId);
    
    if (!preview) {
      return {
        success: false,
        error: `Preview ${previewId} not found`
      };
    }

    try {
      // Vérifier les permissions
      if (!force) {
        const perm = permissionsManager.checkPermission('build', 'delete_preview', { 
          previewId,
          sessionId: preview.sessionId 
        });
        if (!perm.allowed) {
          return {
            success: false,
            error: `PERMISSION DENIED: ${perm.reason}`
          };
        }
      }

      // Arrêter l'aperçu
      const stopResult = await this.stopPreview(previewId);
      if (!stopResult.success) {
        console.warn(`[PreviewManager] Failed to stop preview ${previewId}:`, stopResult.error);
      }

      // Supprimer de la liste
      this.previews.delete(previewId);

      globalEventBus.emit('preview.deleted', { 
        previewId,
        sessionId: preview.sessionId
      });

      return {
        success: true,
        message: `Preview deleted: ${previewId}`
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Nettoyer les aperçus terminés
   */
  async cleanupStoppedPreviews(olderThanMs: number = 3600000): Promise<number> {
    const now = Date.now();
    const stoppedPreviews = this.getStoppedPreviews();
    
    const previewsToCleanup = stoppedPreviews.filter(preview => {
      if (!preview.stoppedAt) return false;
      return now - preview.stoppedAt > olderThanMs;
    });

    let cleanedCount = 0;
    
    for (const preview of previewsToCleanup) {
      const result = await this.deletePreview(preview.id, true);
      if (result.success) {
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  /**
   * Obtenir les tunnels
   */
  getTunnels(): TunnelInfo[] {
    return Array.from(this.tunnels.values());
  }

  /**
   * Obtenir un tunnel
   */
  getTunnel(previewId: string): TunnelInfo | null {
    return this.tunnels.get(previewId) || null;
  }

  /**
   * Arrêter tous les tunnels
   */
  async stopAllTunnels(): Promise<void> {
    const allTunnels = this.getTunnels();
    
    for (const tunnel of allTunnels) {
      if (tunnel.processId) {
        try {
          await this.shellTools.shellCommand(`kill ${tunnel.processId}`);
        } catch (error) {
          console.error(`[PreviewManager] Failed to stop tunnel process ${tunnel.processId}:`, error);
        }
      }
    }

    this.tunnels.clear();
  }

  /**
   * Obtenir le provider actuel
   */
  getProvider(): ExecutionProvider {
    return this.provider;
  }

  /**
   * Mettre à jour le provider
   */
  setProvider(provider: ExecutionProvider): void {
    this.provider = provider;
    this.shellTools.setProvider(provider);
  }

  /**
   * Mettre à jour la configuration
   */
  updateConfig(config: Partial<PreviewConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Obtenir la configuration actuelle
   */
  getConfig(): PreviewConfig {
    return { ...this.config };
  }

  /**
   * Nettoyer tous les aperçus
   */
  async clearAllPreviews(): Promise<void> {
    const allPreviews = this.getAllPreviews();
    
    for (const preview of allPreviews) {
      await this.deletePreview(preview.id, true);
    }

    this.previews.clear();
    this.tunnels.clear();
    this.usedPorts.clear();
  }

  /**
   * Obtenir les statistiques
   */
  getStats(): Record<string, any> {
    return {
      total: this.previews.size,
      running: this.getRunningPreviews().length,
      stopped: this.getStoppedPreviews().length,
      tunnels: this.tunnels.size
    };
  }
}

/**
 * Créer une instance du PreviewManager
 */
export function createPreviewManager(
  provider: ExecutionProvider,
  config: Partial<PreviewConfig> = {}
): PreviewManager {
  return new PreviewManager(provider, config);
}

export { DEFAULT_CONFIG };
