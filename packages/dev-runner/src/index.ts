/**
 * @soryos/dev-runner
 * Dev Runner - Inspiré de Vibra Code
 * 
 * Fonctionnalités:
 * - Détection automatique du type de projet
 * - Installation des dépendances
 * - Build du projet
 * - Exécution du serveur de développement
 * - Détection des ports
 * - Health checks
 * - Preview
 * - Gestion des processus
 * 
 * Règle: NO REAL EXECUTION = NO SUCCESS
 */

import { ExecutionProvider } from '@soryos/execution';
import { ShellTools, CommonCommands } from '@soryos/tool/shell-tools';
import { FilesystemTools } from '@soryos/tool/filesystem-tools';
import { globalEventBus } from '@soryos/bus';
import { permissionsManager } from '@soryos/permissions';

export interface ProjectType {
  type: string;
  name: string;
  language: string;
  framework?: string;
  packageManager?: string;
  buildCommand?: string;
  devCommand?: string;
  testCommand?: string;
  startCommand?: string;
  port?: number;
  configFiles: string[];
  dependenciesFiles: string[];
}

export interface DevRunnerConfig {
  autoInstall: boolean;
  autoBuild: boolean;
  autoStart: boolean;
  defaultPort: number;
  portRange: [number, number];
  healthCheckPath: string;
  healthCheckInterval: number;
  maxHealthChecks: number;
  timeoutMs: number;
}

export interface DevRunnerOptions {
  workspaceId?: string;
  projectPath?: string;
  autoDetect?: boolean;
  projectType?: string;
  /** Run `installDependencies` as part of the full cycle. */
  autoInstall?: boolean;
  /** Run `build` as part of the full cycle. */
  autoBuild?: boolean;
  /** Run `startDevServer` as part of the full cycle. */
  autoStart?: boolean;
  forceInstall?: boolean;
  forceBuild?: boolean;
  forceStart?: boolean;
  continueOnError?: boolean;
}

export interface DevRunnerResult {
  success: boolean;
  projectType?: ProjectType;
  installed?: boolean;
  built?: boolean;
  running?: boolean;
  port?: number;
  url?: string;
  error?: string;
  output?: string;
  metadata?: Record<string, any>;
}

export interface ProcessInfo {
  pid: number;
  command: string;
  port?: number;
  url?: string;
  status: 'running' | 'stopped' | 'failed';
  startTime: number;
  stdout?: string;
  stderr?: string;
}

const DEFAULT_CONFIG: DevRunnerConfig = {
  autoInstall: true,
  autoBuild: true,
  autoStart: true,
  defaultPort: 3000,
  portRange: [3000, 4000],
  healthCheckPath: '/',
  healthCheckInterval: 1000,
  maxHealthChecks: 10,
  timeoutMs: 120000
};

// Définitions des types de projets
const PROJECT_TYPES: ProjectType[] = [
  // Node.js / JavaScript / TypeScript
  {
    type: 'node-express',
    name: 'Node.js Express',
    language: 'JavaScript/TypeScript',
    framework: 'Express',
    packageManager: 'npm',
    buildCommand: 'npm run build',
    devCommand: 'npm run dev',
    startCommand: 'npm start',
    port: 3000,
    configFiles: ['package.json', 'app.js', 'app.ts', 'server.js', 'server.ts'],
    dependenciesFiles: ['package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml']
  },
  {
    type: 'node-nextjs',
    name: 'Next.js',
    language: 'JavaScript/TypeScript',
    framework: 'Next.js',
    packageManager: 'npm',
    buildCommand: 'npm run build',
    devCommand: 'npm run dev',
    startCommand: 'npm start',
    port: 3000,
    configFiles: ['package.json', 'next.config.js', 'next.config.ts', 'pages/_app.js', 'pages/_app.tsx'],
    dependenciesFiles: ['package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml']
  },
  {
    type: 'node-react',
    name: 'React (Vite)',
    language: 'JavaScript/TypeScript',
    framework: 'React Vite',
    packageManager: 'npm',
    buildCommand: 'npm run build',
    devCommand: 'npm run dev',
    startCommand: 'npm run preview',
    port: 5173,
    configFiles: ['package.json', 'vite.config.js', 'vite.config.ts', 'index.html'],
    dependenciesFiles: ['package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml']
  },
  {
    type: 'node-react-cra',
    name: 'React (Create React App)',
    language: 'JavaScript/TypeScript',
    framework: 'Create React App',
    packageManager: 'npm',
    buildCommand: 'npm run build',
    devCommand: 'npm start',
    startCommand: 'npm start',
    port: 3000,
    configFiles: ['package.json', 'src/index.js', 'src/index.tsx'],
    dependenciesFiles: ['package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml']
  },
  {
    type: 'node-vue',
    name: 'Vue.js',
    language: 'JavaScript/TypeScript',
    framework: 'Vue',
    packageManager: 'npm',
    buildCommand: 'npm run build',
    devCommand: 'npm run dev',
    startCommand: 'npm run preview',
    port: 5173,
    configFiles: ['package.json', 'vite.config.js', 'vite.config.ts', 'vue.config.js', 'vue.config.ts'],
    dependenciesFiles: ['package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml']
  },
  {
    type: 'node-angular',
    name: 'Angular',
    language: 'TypeScript',
    framework: 'Angular',
    packageManager: 'npm',
    buildCommand: 'npm run build',
    devCommand: 'ng serve',
    startCommand: 'ng serve',
    port: 4200,
    configFiles: ['package.json', 'angular.json'],
    dependenciesFiles: ['package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml']
  },
  {
    type: 'node-nestjs',
    name: 'NestJS',
    language: 'TypeScript',
    framework: 'NestJS',
    packageManager: 'npm',
    buildCommand: 'npm run build',
    devCommand: 'npm run start:dev',
    startCommand: 'npm run start:prod',
    port: 3000,
    configFiles: ['package.json', 'nest-cli.json', 'src/main.ts'],
    dependenciesFiles: ['package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml']
  },
  
  // Python
  {
    type: 'python-flask',
    name: 'Python Flask',
    language: 'Python',
    framework: 'Flask',
    packageManager: 'pip',
    buildCommand: '',
    devCommand: 'flask run',
    startCommand: 'gunicorn -b :$PORT app:app',
    port: 5000,
    configFiles: ['app.py', 'wsgi.py', 'requirements.txt', 'pyproject.toml'],
    dependenciesFiles: ['requirements.txt', 'setup.py', 'pyproject.toml', 'Pipfile']
  },
  {
    type: 'python-django',
    name: 'Django',
    language: 'Python',
    framework: 'Django',
    packageManager: 'pip',
    buildCommand: 'python manage.py migrate',
    devCommand: 'python manage.py runserver',
    startCommand: 'gunicorn project.wsgi:application',
    port: 8000,
    configFiles: ['manage.py', 'settings.py', 'urls.py'],
    dependenciesFiles: ['requirements.txt', 'setup.py', 'pyproject.toml', 'Pipfile']
  },
  {
    type: 'python-fastapi',
    name: 'FastAPI',
    language: 'Python',
    framework: 'FastAPI',
    packageManager: 'pip',
    buildCommand: '',
    devCommand: 'uvicorn main:app --reload',
    startCommand: 'uvicorn main:app',
    port: 8000,
    configFiles: ['main.py', 'requirements.txt', 'pyproject.toml'],
    dependenciesFiles: ['requirements.txt', 'setup.py', 'pyproject.toml', 'Pipfile']
  },
  
  // Rust
  {
    type: 'rust-actix',
    name: 'Rust Actix-Web',
    language: 'Rust',
    framework: 'Actix-Web',
    packageManager: 'cargo',
    buildCommand: 'cargo build',
    devCommand: 'cargo run',
    startCommand: 'cargo run --release',
    port: 8080,
    configFiles: ['Cargo.toml', 'src/main.rs'],
    dependenciesFiles: ['Cargo.toml', 'Cargo.lock']
  },
  {
    type: 'rust-rocket',
    name: 'Rust Rocket',
    language: 'Rust',
    framework: 'Rocket',
    packageManager: 'cargo',
    buildCommand: 'cargo build',
    devCommand: 'cargo run',
    startCommand: 'cargo run --release',
    port: 8000,
    configFiles: ['Cargo.toml', 'src/main.rs', 'Rocket.toml'],
    dependenciesFiles: ['Cargo.toml', 'Cargo.lock']
  },
  
  // Go
  {
    type: 'go-gin',
    name: 'Go Gin',
    language: 'Go',
    framework: 'Gin',
    packageManager: 'go',
    buildCommand: 'go build',
    devCommand: 'go run main.go',
    startCommand: 'go run main.go',
    port: 8080,
    configFiles: ['main.go', 'go.mod'],
    dependenciesFiles: ['go.mod', 'go.sum']
  },
  {
    type: 'go-fiber',
    name: 'Go Fiber',
    language: 'Go',
    framework: 'Fiber',
    packageManager: 'go',
    buildCommand: 'go build',
    devCommand: 'go run main.go',
    startCommand: 'go run main.go',
    port: 3000,
    configFiles: ['main.go', 'go.mod'],
    dependenciesFiles: ['go.mod', 'go.sum']
  },
  
  // Java
  {
    type: 'java-spring',
    name: 'Spring Boot',
    language: 'Java',
    framework: 'Spring Boot',
    packageManager: 'maven',
    buildCommand: 'mvn package',
    devCommand: 'mvn spring-boot:run',
    startCommand: 'java -jar target/*.jar',
    port: 8080,
    configFiles: ['pom.xml', 'src/main/java/*Application.java'],
    dependenciesFiles: ['pom.xml', 'build.gradle']
  },
  
  // PHP
  {
    type: 'php-laravel',
    name: 'Laravel',
    language: 'PHP',
    framework: 'Laravel',
    packageManager: 'composer',
    buildCommand: 'composer install --no-dev',
    devCommand: 'php artisan serve',
    startCommand: 'php artisan serve',
    port: 8000,
    configFiles: ['artisan', 'composer.json', 'config/app.php'],
    dependenciesFiles: ['composer.json', 'composer.lock']
  },
  
  // Ruby
  {
    type: 'ruby-rails',
    name: 'Ruby on Rails',
    language: 'Ruby',
    framework: 'Rails',
    packageManager: 'bundle',
    buildCommand: 'bundle install',
    devCommand: 'rails server',
    startCommand: 'rails server -e production',
    port: 3000,
    configFiles: ['config/application.rb', 'Gemfile'],
    dependenciesFiles: ['Gemfile', 'Gemfile.lock']
  },
  
  // Static Sites
  {
    type: 'static-html',
    name: 'Static HTML',
    language: 'HTML/CSS/JS',
    framework: 'Static',
    packageManager: undefined,
    buildCommand: '',
    devCommand: '',
    startCommand: '',
    port: 8080,
    configFiles: ['index.html'],
    dependenciesFiles: []
  },
  {
    type: 'static-next-export',
    name: 'Next.js Static Export',
    language: 'JavaScript/TypeScript',
    framework: 'Next.js',
    packageManager: 'npm',
    buildCommand: 'npm run build && npm run export',
    devCommand: 'npm run dev',
    startCommand: 'npx serve out',
    port: 3000,
    configFiles: ['package.json', 'next.config.js'],
    dependenciesFiles: ['package.json', 'package-lock.json']
  }
];

/**
 * Dev Runner - Gestion complète du cycle de développement
 */
export class DevRunner {
  private config: DevRunnerConfig;
  private provider: ExecutionProvider;
  private shellTools: ShellTools;
  private fsTools: FilesystemTools;
  
  private detectedProjectType: ProjectType | null = null;
  private runningProcesses: Map<string, ProcessInfo> = new Map();
  private usedPorts: Set<number> = new Set();

  constructor(
    provider: ExecutionProvider,
    config: Partial<DevRunnerConfig> = {}
  ) {
    this.provider = provider;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.shellTools = new ShellTools(provider);
    this.fsTools = new FilesystemTools(provider);
  }

  /**
   * Détecter le type de projet
   */
  async detectProjectType(
    path: string = '',
    options: DevRunnerOptions = {}
  ): Promise<DevRunnerResult> {
    const callId = `detect-${Date.now()}`;
    
    try {
      // Vérifier les permissions
      const perm = permissionsManager.checkPermission('read', 'detect_project_type', { path });
      if (!perm.allowed) {
        globalEventBus.emit('permission.denied', { 
          toolName: 'detect_project_type', 
          reason: perm.reason,
          callId 
        });
        return {
          success: false,
          error: `PERMISSION DENIED: ${perm.reason}`
        };
      }

      globalEventBus.emit('dev-runner.detect.started', { 
        path,
        callId
      });

      // Si le type est déjà détecté et pas de redétection demandée
      if (this.detectedProjectType && !options.forceInstall) {
        return {
          success: true,
          projectType: this.detectedProjectType,
          metadata: { cached: true }
        };
      }

      // Lister les fichiers pour la détection
      const listResult = await this.fsTools.listFiles(path, true, false);
      
      if (!listResult.success) {
        return {
          success: false,
          error: `Failed to list files: ${listResult.error}`
        };
      }

      // Parser les fichiers
      const files = this.parseFileList(listResult.output || '');
      
      // Détecter le type de projet
      const projectType = this.detectFromFiles(files, path);
      
      if (!projectType) {
        return {
          success: false,
          error: 'Could not detect project type'
        };
      }

      this.detectedProjectType = projectType;

      globalEventBus.emit('dev-runner.detect.completed', { 
        path,
        projectType,
        callId
      });

      return {
        success: true,
        projectType,
        metadata: { files: files.length }
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      globalEventBus.emit('dev-runner.detect.failed', { 
        path,
        error: errorMessage,
        callId
      });

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Parser la liste des fichiers
   */
  private parseFileList(output: string): string[] {
    const lines = output.split('\n');
    const files: string[] = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('[DIR]')) {
        continue;
      }
      if (trimmed && !trimmed.startsWith('Found')) {
        const match = trimmed.match(/^\s+(.+?)\s*\(/);
        if (match) {
          files.push(match[1]);
        }
      }
    }
    
    return files;
  }

  /**
   * Détecter le type de projet depuis les fichiers
   */
  private detectFromFiles(files: string[], path: string): ProjectType | null {
    // Score pour chaque type de projet
    const scores: Map<string, number> = new Map();
    
    // Vérifier les fichiers clés pour chaque type
    for (const projectType of PROJECT_TYPES) {
      let score = 0;
      
      // Vérifier les fichiers de configuration
      for (const configFile of projectType.configFiles) {
        if (files.some(f => f.includes(configFile) || f.endsWith(configFile))) {
          score += 2;
        }
      }
      
      // Vérifier les fichiers de dépendances
      for (const depFile of projectType.dependenciesFiles) {
        if (files.some(f => f.includes(depFile) || f.endsWith(depFile))) {
          score += 1;
        }
      }
      
      // Vérifier le package manager
      if (projectType.packageManager) {
        if (files.some(f => f === 'package.json')) {
          score += 1;
        }
        if (files.some(f => f === 'requirements.txt')) {
          score += 1;
        }
        if (files.some(f => f === 'Cargo.toml')) {
          score += 1;
        }
        if (files.some(f => f === 'go.mod')) {
          score += 1;
        }
      }
      
      if (score > 0) {
        scores.set(projectType.type, score);
      }
    }
    
    // Trouver le type avec le score le plus élevé
    let maxScore = 0;
    let bestType: ProjectType | null = null;
    
    for (const [type, score] of scores) {
      if (score > maxScore) {
        maxScore = score;
        const projectType = PROJECT_TYPES.find(pt => pt.type === type);
        if (projectType) {
          bestType = projectType;
        }
      }
    }
    
    // Si aucun type détecté, essayer de détecter par le langage
    if (!bestType) {
      bestType = this.detectFromLanguage(files);
    }
    
    return bestType;
  }

  /**
   * Détecter le type de projet depuis le langage
   */
  private detectFromLanguage(files: string[]): ProjectType | null {
    const languageIndicators: Record<string, string[]> = {
      'JavaScript/TypeScript': ['.js', '.ts', '.jsx', '.tsx', 'package.json'],
      'Python': ['.py', 'requirements.txt', 'setup.py', 'pyproject.toml'],
      'Rust': ['.rs', 'Cargo.toml'],
      'Go': ['.go', 'go.mod'],
      'Java': ['.java', 'pom.xml', 'build.gradle'],
      'PHP': ['.php', 'composer.json'],
      'Ruby': ['.rb', 'Gemfile']
    };
    
    for (const [language, indicators] of Object.entries(languageIndicators)) {
      const hasIndicator = indicators.some(indicator => 
        files.some(f => f.includes(indicator) || f.endsWith(indicator))
      );
      
      if (hasIndicator) {
        // Retourner le premier type correspondant à ce langage
        const matchingTypes = PROJECT_TYPES.filter(pt => pt.language === language);
        if (matchingTypes.length > 0) {
          return matchingTypes[0];
        }
      }
    }
    
    return null;
  }

  /**
   * Installer les dépendances
   */
  async installDependencies(
    path: string = '',
    options: DevRunnerOptions = {}
  ): Promise<DevRunnerResult> {
    const callId = `install-${Date.now()}`;
    
    try {
      // Détecter le type de projet si non spécifié
      const projectType = (options.projectType 
        ? PROJECT_TYPES.find(pt => pt.type === options.projectType) 
        : this.detectedProjectType) ?? undefined;
      
      if (!projectType) {
        const detectResult = await this.detectProjectType(path, options);
        if (!detectResult.success) {
          return detectResult;
        }
      }

      // Vérifier les permissions
      const perm = permissionsManager.checkPermission('build', 'install_dependencies', { path });
      if (!perm.allowed) {
        globalEventBus.emit('permission.denied', { 
          toolName: 'install_dependencies', 
          reason: perm.reason,
          callId 
        });
        return {
          success: false,
          error: `PERMISSION DENIED: ${perm.reason}`
        };
      }

      globalEventBus.emit('dev-runner.install.started', { 
        path,
        projectType: projectType?.type,
        callId
      });

      // Déterminer la commande d'installation
      const installCommand = this.getInstallCommand(projectType);
      
      if (!installCommand) {
        return {
          success: false,
          error: 'No install command available for this project type'
        };
      }

      // Exécuter la commande d'installation
      const result = await this.shellTools.shellCommand(installCommand, {
        cwd: path,
        timeoutMs: this.config.timeoutMs * 2
      });

      if (!result.success) {
        return {
          success: false,
          error: result.error || 'Failed to install dependencies',
          output: result.stdout
        };
      }

      globalEventBus.emit('dev-runner.install.completed', { 
        path,
        projectType: projectType?.type,
        output: result.stdout,
        callId
      });

      return {
        success: true,
        projectType,
        installed: true,
        output: result.stdout,
        metadata: {
          command: installCommand,
          exitCode: result.exitCode
        }
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      globalEventBus.emit('dev-runner.install.failed', { 
        path,
        error: errorMessage,
        callId
      });

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Obtenir la commande d'installation
   */
  private getInstallCommand(projectType: ProjectType | null | undefined): string | null {
    if (!projectType) return null;
    
    switch (projectType.packageManager) {
      case 'npm':
        return 'npm install';
      case 'yarn':
        return 'yarn install';
      case 'pnpm':
        return 'pnpm install';
      case 'pip':
        return 'pip install -r requirements.txt';
      case 'cargo':
        return 'cargo build';
      case 'go':
        return 'go mod tidy && go mod download';
      case 'maven':
        return 'mvn install';
      case 'composer':
        return 'composer install';
      case 'bundle':
        return 'bundle install';
      default:
        return null;
    }
  }

  /**
   * Build le projet
   */
  async build(
    path: string = '',
    options: DevRunnerOptions = {}
  ): Promise<DevRunnerResult> {
    const callId = `build-${Date.now()}`;
    
    try {
      // Détecter le type de projet si non spécifié
      const projectType = (options.projectType 
        ? PROJECT_TYPES.find(pt => pt.type === options.projectType) 
        : this.detectedProjectType) ?? undefined;
      
      if (!projectType) {
        const detectResult = await this.detectProjectType(path, options);
        if (!detectResult.success) {
          return detectResult;
        }
      }

      // Vérifier les permissions
      const perm = permissionsManager.checkPermission('build', 'build', { path });
      if (!perm.allowed) {
        globalEventBus.emit('permission.denied', { 
          toolName: 'build', 
          reason: perm.reason,
          callId 
        });
        return {
          success: false,
          error: `PERMISSION DENIED: ${perm.reason}`
        };
      }

      globalEventBus.emit('dev-runner.build.started', { 
        path,
        projectType: projectType?.type,
        callId
      });

      // Déterminer la commande de build
      const buildCommand = projectType?.buildCommand || '';
      
      if (!buildCommand) {
        return {
          success: false,
          error: 'No build command available for this project type'
        };
      }

      // Exécuter la commande de build
      const result = await this.shellTools.shellCommand(buildCommand, {
        cwd: path,
        timeoutMs: this.config.timeoutMs * 2
      });

      if (!result.success) {
        return {
          success: false,
          error: result.error || 'Build failed',
          output: result.stdout
        };
      }

      globalEventBus.emit('dev-runner.build.completed', { 
        path,
        projectType: projectType?.type,
        output: result.stdout,
        callId
      });

      return {
        success: true,
        projectType,
        built: true,
        output: result.stdout,
        metadata: {
          command: buildCommand,
          exitCode: result.exitCode
        }
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      globalEventBus.emit('dev-runner.build.failed', { 
        path,
        error: errorMessage,
        callId
      });

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Démarrer le serveur de développement
   */
  async startDevServer(
    path: string = '',
    options: DevRunnerOptions = {}
  ): Promise<DevRunnerResult> {
    const callId = `start-dev-${Date.now()}`;
    
    try {
      // Détecter le type de projet si non spécifié
      const projectType = (options.projectType 
        ? PROJECT_TYPES.find(pt => pt.type === options.projectType) 
        : this.detectedProjectType) ?? undefined;
      
      if (!projectType) {
        const detectResult = await this.detectProjectType(path, options);
        if (!detectResult.success) {
          return detectResult;
        }
      }

      // Vérifier les permissions
      const perm = permissionsManager.checkPermission('build', 'start_dev_server', { path });
      if (!perm.allowed) {
        globalEventBus.emit('permission.denied', { 
          toolName: 'start_dev_server', 
          reason: perm.reason,
          callId 
        });
        return {
          success: false,
          error: `PERMISSION DENIED: ${perm.reason}`
        };
      }

      globalEventBus.emit('dev-runner.start.started', { 
        path,
        projectType: projectType?.type,
        callId
      });

      // Déterminer la commande de démarrage
      const startCommand = options.forceStart 
        ? projectType?.startCommand 
        : projectType?.devCommand;
      
      if (!startCommand) {
        return {
          success: false,
          error: 'No start command available for this project type'
        };
      }

      // Déterminer le port
      const port = await this.findAvailablePort(projectType?.port);
      
      // Remplacer le port dans la commande si nécessaire
      const finalCommand = startCommand.replace(/\$PORT|\b3000\b|\b8000\b|\b8080\b/g, port.toString());
      
      // Démarrer le serveur en arrière-plan
      const processInfo = await this.shellTools.backgroundCommand(finalCommand, {
        cwd: path
      });

      // Attendre que le serveur soit prêt
      const healthCheckResult = await this.waitForHealthCheck(
        `http://localhost:${port}${this.config.healthCheckPath}`,
        this.config.healthCheckInterval,
        this.config.maxHealthChecks
      );

      if (!healthCheckResult.success) {
        // Arrêter le processus
        await this.stopDevServer(path);
        
        return {
          success: false,
          error: `Server failed to start: ${healthCheckResult.error}`,
          output: healthCheckResult.output
        };
      }

      // Enregistrer le processus
      this.runningProcesses.set(path, {
        pid: processInfo.pid,
        command: finalCommand,
        port,
        url: `http://localhost:${port}`,
        status: 'running',
        startTime: Date.now()
      });

      this.usedPorts.add(port);

      globalEventBus.emit('dev-runner.start.completed', { 
        path,
        projectType: projectType?.type,
        port,
        url: `http://localhost:${port}`,
        pid: processInfo.pid,
        callId
      });

      return {
        success: true,
        projectType,
        running: true,
        port,
        url: `http://localhost:${port}`,
        metadata: {
          command: finalCommand,
          pid: processInfo.pid,
          healthCheck: healthCheckResult.success
        }
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      globalEventBus.emit('dev-runner.start.failed', { 
        path,
        error: errorMessage,
        callId
      });

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Trouver un port disponible
   */
  private async findAvailablePort(defaultPort?: number): Promise<number> {
    const startPort = defaultPort || this.config.defaultPort;
    const endPort = this.config.portRange[1];
    
    for (let port = startPort; port <= endPort; port++) {
      if (!this.usedPorts.has(port)) {
        // Vérifier si le port est disponible
        const isAvailable = await this.checkPortAvailability(port);
        if (isAvailable) {
          return port;
        }
      }
    }
    
    // Si aucun port disponible, utiliser un port aléatoire
    return Math.floor(Math.random() * (65535 - 1024 + 1)) + 1024;
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
      
      // Si la commande échoue, le port est probablement disponible
      return !result.success || result.stdout === '';
    } catch {
      return true;
    }
  }

  /**
   * Attendre le health check
   */
  private async waitForHealthCheck(
    url: string,
    interval: number,
    maxChecks: number
  ): Promise<{ success: boolean; output?: string; error?: string }> {
    let checkCount = 0;
    
    while (checkCount < maxChecks) {
      try {
        // Utiliser curl ou wget pour vérifier
        const result = await this.shellTools.shellCommand(
          `curl -s -o /dev/null -w "%{http_code}" ${url}`,
          { timeoutMs: interval }
        );
        
        if (result.success && result.stdout?.includes('200')) {
          return { success: true };
        }
      } catch {
        // Ignorer les erreurs
      }
      
      checkCount++;
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    
    return {
      success: false,
      error: `Server did not respond after ${maxChecks * interval}ms`
    };
  }

  /**
   * Arrêter le serveur de développement
   */
  async stopDevServer(path: string = ''): Promise<DevRunnerResult> {
    const callId = `stop-dev-${Date.now()}`;
    
    try {
      // Vérifier les permissions
      const perm = permissionsManager.checkPermission('build', 'stop_dev_server', { path });
      if (!perm.allowed) {
        globalEventBus.emit('permission.denied', { 
          toolName: 'stop_dev_server', 
          reason: perm.reason,
          callId 
        });
        return {
          success: false,
          error: `PERMISSION DENIED: ${perm.reason}`
        };
      }

      const processInfo = this.runningProcesses.get(path);
      
      if (!processInfo) {
        return {
          success: false,
          error: 'No running dev server found for this path'
        };
      }

      globalEventBus.emit('dev-runner.stop.started', { 
        path,
        pid: processInfo.pid,
        callId
      });

      // Arrêter le processus
      const result = await this.shellTools.stopProcess(processInfo.pid);
      
      if (!result) {
        return {
          success: false,
          error: 'Failed to stop dev server'
        };
      }

      // Nettoyer
      processInfo.status = 'stopped';
      this.runningProcesses.set(path, processInfo);
      
      if (processInfo.port) {
        this.usedPorts.delete(processInfo.port);
      }

      globalEventBus.emit('dev-runner.stop.completed', { 
        path,
        pid: processInfo.pid,
        callId
      });

      return {
        success: true,
        output: `Dev server stopped (PID: ${processInfo.pid})`,
        metadata: {
          pid: processInfo.pid,
          port: processInfo.port
        }
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      globalEventBus.emit('dev-runner.stop.failed', { 
        path,
        error: errorMessage,
        callId
      });

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Redémarrer le serveur de développement
   */
  async restartDevServer(path: string = '', options: DevRunnerOptions = {}): Promise<DevRunnerResult> {
    const callId = `restart-dev-${Date.now()}`;
    
    try {
      // Arrêter le serveur actuel
      const stopResult = await this.stopDevServer(path);
      
      if (!stopResult.success && !stopResult.error?.includes('No running dev server')) {
        return stopResult;
      }

      // Démarrer le serveur
      const startResult = await this.startDevServer(path, options);
      
      if (!startResult.success) {
        return startResult;
      }

      globalEventBus.emit('dev-runner.restart.completed', { 
        path,
        port: startResult.port,
        callId
      });

      return startResult;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      globalEventBus.emit('dev-runner.restart.failed', { 
        path,
        error: errorMessage,
        callId
      });

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Exécuter les tests
   */
  async runTests(
    path: string = '',
    options: DevRunnerOptions = {}
  ): Promise<DevRunnerResult> {
    const callId = `run-tests-${Date.now()}`;
    
    try {
      // Détecter le type de projet si non spécifié
      const projectType = (options.projectType 
        ? PROJECT_TYPES.find(pt => pt.type === options.projectType) 
        : this.detectedProjectType) ?? undefined;
      
      if (!projectType) {
        const detectResult = await this.detectProjectType(path, options);
        if (!detectResult.success) {
          return detectResult;
        }
      }

      // Vérifier les permissions
      const perm = permissionsManager.checkPermission('build', 'run_tests', { path });
      if (!perm.allowed) {
        globalEventBus.emit('permission.denied', { 
          toolName: 'run_tests', 
          reason: perm.reason,
          callId 
        });
        return {
          success: false,
          error: `PERMISSION DENIED: ${perm.reason}`
        };
      }

      globalEventBus.emit('dev-runner.test.started', { 
        path,
        projectType: projectType?.type,
        callId
      });

      // Déterminer la commande de test
      const testCommand = projectType?.testCommand || projectType?.devCommand || '';
      
      if (!testCommand) {
        return {
          success: false,
          error: 'No test command available for this project type'
        };
      }

      // Exécuter la commande de test
      const result = await this.shellTools.shellCommand(testCommand, {
        cwd: path,
        timeoutMs: this.config.timeoutMs * 2
      });

      if (!result.success) {
        return {
          success: false,
          error: result.error || 'Tests failed',
          output: result.stdout
        };
      }

      globalEventBus.emit('dev-runner.test.completed', { 
        path,
        projectType: projectType?.type,
        output: result.stdout,
        callId
      });

      return {
        success: true,
        projectType,
        output: result.stdout,
        metadata: {
          command: testCommand,
          exitCode: result.exitCode
        }
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      globalEventBus.emit('dev-runner.test.failed', { 
        path,
        error: errorMessage,
        callId
      });

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Exécuter le cycle complet (detect, install, build, start)
   */
  async runFullCycle(
    path: string = '',
    options: DevRunnerOptions = {}
  ): Promise<DevRunnerResult> {
    const callId = `full-cycle-${Date.now()}`;
    const results: DevRunnerResult[] = [];
    
    try {
      globalEventBus.emit('dev-runner.cycle.started', { 
        path,
        callId
      });

      // 1. Détecter le type de projet
      if (!options.projectType || options.autoDetect) {
        const detectResult = await this.detectProjectType(path, options);
        results.push(detectResult);
        
        if (!detectResult.success) {
          return detectResult;
        }
      }

      // 2. Installer les dépendances
      if (options.autoInstall || options.forceInstall) {
        const installResult = await this.installDependencies(path, options);
        results.push(installResult);
        
        if (!installResult.success) {
          if (!options.continueOnError) {
            return installResult;
          }
        }
      }

      // 3. Build le projet
      if (options.autoBuild || options.forceBuild) {
        const buildResult = await this.build(path, options);
        results.push(buildResult);
        
        if (!buildResult.success) {
          if (!options.continueOnError) {
            return buildResult;
          }
        }
      }

      // 4. Démarrer le serveur
      if (options.autoStart || options.forceStart) {
        const startResult = await this.startDevServer(path, options);
        results.push(startResult);
        
        if (!startResult.success) {
          if (!options.continueOnError) {
            return startResult;
          }
        }
        
        return startResult;
      }

      // Retourner le dernier résultat
      return results[results.length - 1] || { success: true };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      globalEventBus.emit('dev-runner.cycle.failed', { 
        path,
        error: errorMessage,
        callId
      });

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Obtenir l'état du serveur
   */
  async getServerStatus(path: string = ''): Promise<DevRunnerResult> {
    const processInfo = this.runningProcesses.get(path);
    
    if (!processInfo) {
      return {
        success: false,
        error: 'No running dev server found for this path'
      };
    }

    try {
      // Vérifier si le processus est toujours en cours
      const status = await this.shellTools.getProcessStatus(processInfo.pid);
      
      if (!status) {
        processInfo.status = 'stopped';
        this.runningProcesses.set(path, processInfo);
        
        return {
          success: true,
          running: false,
          metadata: processInfo
        };
      }

      // Vérifier le health check
      if (processInfo.url) {
        const healthCheck = await this.waitForHealthCheck(
          processInfo.url + this.config.healthCheckPath,
          this.config.healthCheckInterval,
          1
        );
        
        if (!healthCheck.success) {
          processInfo.status = 'failed';
          this.runningProcesses.set(path, processInfo);
          
          return {
            success: true,
            running: false,
            error: 'Server not responding to health checks',
            metadata: processInfo
          };
        }
      }

      return {
        success: true,
        running: true,
        port: processInfo.port,
        url: processInfo.url,
        metadata: processInfo
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: processInfo
      };
    }
  }

  /**
   * Obtenir toutes les informations des serveurs en cours
   */
  getAllServerStatuses(): ProcessInfo[] {
    return Array.from(this.runningProcesses.values());
  }

  /**
   * Arrêter tous les serveurs
   */
  async stopAllServers(): Promise<DevRunnerResult> {
    const stopResults: DevRunnerResult[] = [];
    
    for (const [path] of this.runningProcesses) {
      const result = await this.stopDevServer(path);
      stopResults.push(result);
    }
    
    const allSuccess = stopResults.every(r => r.success);
    
    return {
      success: allSuccess,
      output: `Stopped ${stopResults.length} servers`,
      metadata: {
        results: stopResults
      }
    };
  }

  /**
   * Libérer un port
   */
  releasePort(port: number): void {
    this.usedPorts.delete(port);
  }

  /**
   * Réserver un port
   */
  reservePort(port: number): boolean {
    if (this.usedPorts.has(port)) {
      return false;
    }
    
    this.usedPorts.add(port);
    return true;
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
    this.fsTools.setProvider(provider);
  }

  /**
   * Mettre à jour la configuration
   */
  updateConfig(config: Partial<DevRunnerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Obtenir la configuration actuelle
   */
  getConfig(): DevRunnerConfig {
    return { ...this.config };
  }

  /**
   * Réinitialiser l'état
   */
  reset(): void {
    this.detectedProjectType = null;
    this.runningProcesses.clear();
    this.usedPorts.clear();
  }
}

/**
 * Créer une instance du DevRunner
 */
export function createDevRunner(
  provider: ExecutionProvider,
  config: Partial<DevRunnerConfig> = {}
): DevRunner {
  return new DevRunner(provider, config);
}

/**
 * Obtenir les types de projets supportés
 */
export function getSupportedProjectTypes(): ProjectType[] {
  return [...PROJECT_TYPES];
}

import { LocalExecutionProvider } from '@soryos/execution';

export const devRunner = new DevRunner(new LocalExecutionProvider());

export { PROJECT_TYPES, DEFAULT_CONFIG };
