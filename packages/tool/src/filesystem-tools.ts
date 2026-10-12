/**
 * @soryos/tool
 * Filesystem Tools - Extrait et adapté de Vibra Code
 * 
 * Fonctionnalités:
 * - read_file: Lecture de fichiers avec numéros de ligne
 * - write_file: Écriture avec vérification physique
 * - edit_file: Édition chirurgicale avec vérification
 * - apply_patch: Application de patches
 * - list_files: Liste des fichiers et répertoires
 * - glob_files: Recherche par pattern glob
 * - grep_search: Recherche de patterns
 * - delete_file: Suppression de fichiers
 * - create_directory: Création de répertoires
 * - move_file: Déplacement/renommage
 * 
 * Règle: NO REAL EXECUTION = NO SUCCESS
 */

import { toolRegistry } from './index';
import { ExecutionProvider } from '@soryos/execution';
import { SessionData } from '@soryos/schema';
import { globalEventBus } from '@soryos/bus';
import { permissionsManager } from '@soryos/permissions';

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  sizeBytes: number;
  createdAt?: number;
  modifiedAt?: number;
}

export interface ListFilesOptions {
  directoryPath?: string;
  recursive?: boolean;
  includeHidden?: boolean;
}

export interface GlobOptions {
  pattern: string;
  directoryPath?: string;
  caseSensitive?: boolean;
}

export interface GrepOptions {
  query: string;
  path?: string;
  caseSensitive?: boolean;
  useRegex?: boolean;
  maxMatches?: number;
}

export interface EditOptions {
  filePath: string;
  targetContent: string;
  replacementContent: string;
  allOccurrences?: boolean;
}

export interface PatchOptions {
  filePath: string;
  patch: string;
}

export interface FileSystemToolResult {
  success: boolean;
  output?: string;
  error?: string;
  metadata?: Record<string, any>;
  verified?: boolean;
}

/**
 * Filesystem Tools Implementation
 * 
 * Ces outils exécutent des opérations réelles sur le système de fichiers.
 * Chaque opération est vérifiée physiquement avant de retourner un succès.
 */
export class FilesystemTools {
  private provider: ExecutionProvider;

  constructor(provider: ExecutionProvider) {
    this.provider = provider;
  }

  /**
   * Lire un fichier avec numéros de ligne
   * 
   * @param filePath - Chemin relatif du fichier
   * @param offset - Ligne de départ (1-indexed, optionnel)
   * @param limit - Nombre max de lignes à lire (optionnel)
   * @returns Contenu du fichier avec numéros de ligne
   */
  async readFile(
    filePath: string,
    offset?: number,
    limit?: number
  ): Promise<FileSystemToolResult> {
    const callId = `read-${Date.now()}`;
    
    try {
      // Vérifier les permissions
      const perm = permissionsManager.checkPermission('read', 'read_file', { filePath });
      if (!perm.allowed) {
        globalEventBus.emit('permission.denied', { 
          toolName: 'read_file', 
          reason: perm.reason,
          callId 
        });
        return {
          success: false,
          error: `PERMISSION DENIED: ${perm.reason}`
        };
      }

      globalEventBus.emit('tool.started', { 
        toolName: 'read_file', 
        input: { filePath, offset, limit },
        callId 
      });

      // Lire le fichier via le provider
      const content = await this.provider.readFile(filePath);
      
      // Vérifier que le fichier existe réellement
      const lines = content.split('\n');
      const totalLines = lines.length;
      
      // Appliquer offset et limit
      const startLine = Math.max(1, offset || 1);
      const maxLines = limit || totalLines;
      const endLine = Math.min(startLine + maxLines - 1, totalLines);
      const selectedLines = lines.slice(startLine - 1, endLine);
      
      // Formater avec numéros de ligne
      const numberedContent = selectedLines
        .map((line, idx) => `${String(startLine + idx).padStart(4, ' ')} | ${line}`)
        .join('\n');

      const result: FileSystemToolResult = {
        success: true,
        output: `=== ${filePath} (${totalLines} lines total, showing ${selectedLines.length} lines) ===\n${numberedContent}`,
        metadata: {
          filePath,
          totalLines,
          linesShown: selectedLines.length,
          offset: startLine,
          limit: maxLines
        },
        verified: true
      };

      globalEventBus.emit('tool.completed', { 
        toolName: 'read_file', 
        output: result.output,
        callId,
        metadata: result.metadata 
      });

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      globalEventBus.emit('tool.failed', { 
        toolName: 'read_file', 
        error: errorMessage,
        callId 
      });

      return {
        success: false,
        error: `Failed to read file: ${errorMessage}`
      };
    }
  }

  /**
   * Écrire un fichier avec vérification physique
   * 
   * @param filePath - Chemin relatif du fichier
   * @param content - Contenu à écrire
   * @returns Résultat avec vérification
   */
  async writeFile(
    filePath: string,
    content: string
  ): Promise<FileSystemToolResult> {
    const callId = `write-${Date.now()}`;
    
    try {
      // Vérifier les permissions
      const perm = permissionsManager.checkPermission('build', 'write_file', { filePath });
      if (!perm.allowed) {
        globalEventBus.emit('permission.denied', { 
          toolName: 'write_file', 
          reason: perm.reason,
          callId 
        });
        return {
          success: false,
          error: `PERMISSION DENIED: ${perm.reason}`
        };
      }

      globalEventBus.emit('tool.started', { 
        toolName: 'write_file', 
        input: { filePath, contentLength: content.length },
        callId 
      });

      // Écrire le fichier
      await this.provider.writeFile(filePath, content);
      
      // VÉRIFICATION PHYSIQUE: Lire le fichier pour confirmer
      const verifiedContent = await this.provider.readFile(filePath);
      
      if (verifiedContent !== content) {
        throw new Error(`Disk verification failed: written content does not match for ${filePath}`);
      }

      const lineCount = content.split('\n').length;
      
      globalEventBus.emit('file.changed', { 
        path: filePath, 
        action: 'write',
        lineCount 
      });

      const result: FileSystemToolResult = {
        success: true,
        output: `[SUCCESS] Verified write to ${filePath} (${lineCount} lines confirmed on disk).`,
        metadata: {
          filePath,
          lineCount,
          byteCount: Buffer.byteLength(content, 'utf8')
        },
        verified: true
      };

      globalEventBus.emit('tool.completed', { 
        toolName: 'write_file', 
        output: result.output,
        callId,
        metadata: result.metadata 
      });

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      globalEventBus.emit('tool.failed', { 
        toolName: 'write_file', 
        error: errorMessage,
        callId 
      });

      return {
        success: false,
        error: `Failed to write file: ${errorMessage}`
      };
    }
  }

  /**
   * Éditer un fichier (remplacement chirurgical) avec vérification
   * 
   * @param filePath - Chemin du fichier
   * @param targetContent - Contenu exact à remplacer
   * @param replacementContent - Nouveau contenu
   * @param allOccurrences - Remplacer toutes les occurrences (défaut: première seule)
   * @returns Résultat avec vérification
   */
  async editFile(
    filePath: string,
    targetContent: string,
    replacementContent: string,
    allOccurrences: boolean = false
  ): Promise<FileSystemToolResult> {
    const callId = `edit-${Date.now()}`;
    
    try {
      // Vérifier les permissions
      const perm = permissionsManager.checkPermission('build', 'edit_file', { 
        filePath, 
        targetContent,
        replacementContent 
      });
      if (!perm.allowed) {
        globalEventBus.emit('permission.denied', { 
          toolName: 'edit_file', 
          reason: perm.reason,
          callId 
        });
        return {
          success: false,
          error: `PERMISSION DENIED: ${perm.reason}`
        };
      }

      globalEventBus.emit('tool.started', { 
        toolName: 'edit_file', 
        input: { filePath, targetLength: targetContent.length, replacementLength: replacementContent.length },
        callId 
      });

      // Lire le contenu actuel
      const currentContent = await this.provider.readFile(filePath);
      
      // Effectuer le remplacement
      let newContent: string;
      if (allOccurrences) {
        newContent = currentContent.split(targetContent).join(replacementContent);
      } else {
        newContent = currentContent.replace(targetContent, replacementContent);
      }
      
      // Vérifier que le remplacement a eu lieu
      if (newContent === currentContent) {
        throw new Error(`Target content not found in ${filePath}`);
      }
      
      // Écrire le nouveau contenu
      await this.provider.writeFile(filePath, newContent);
      
      // VÉRIFICATION PHYSIQUE: Relire et vérifier que le remplacement est présent
      const verifiedContent = await this.provider.readFile(filePath);
      
      if (!verifiedContent.includes(replacementContent)) {
        throw new Error(`Edit verification failed: replacement not found in ${filePath}`);
      }

      globalEventBus.emit('file.changed', { 
        path: filePath, 
        action: 'edit' 
      });

      const result: FileSystemToolResult = {
        success: true,
        output: `[SUCCESS] Verified surgical edit to ${filePath}.`,
        metadata: {
          filePath,
          targetLength: targetContent.length,
          replacementLength: replacementContent.length,
          occurrencesReplaced: allOccurrences ? 
            (currentContent.split(targetContent).length - 1) : 1
        },
        verified: true
      };

      globalEventBus.emit('tool.completed', { 
        toolName: 'edit_file', 
        output: result.output,
        callId,
        metadata: result.metadata 
      });

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      globalEventBus.emit('tool.failed', { 
        toolName: 'edit_file', 
        error: errorMessage,
        callId 
      });

      return {
        success: false,
        error: `Failed to edit file: ${errorMessage}`
      };
    }
  }

  /**
   * Appliquer un patch (unified diff ou search/replace)
   * 
   * @param filePath - Chemin du fichier
   * @param patch - Contenu du patch
   * @returns Résultat avec vérification
   */
  async applyPatch(
    filePath: string,
    patch: string
  ): Promise<FileSystemToolResult> {
    const callId = `patch-${Date.now()}`;
    
    try {
      // Vérifier les permissions
      const perm = permissionsManager.checkPermission('build', 'apply_patch', { filePath });
      if (!perm.allowed) {
        globalEventBus.emit('permission.denied', { 
          toolName: 'apply_patch', 
          reason: perm.reason,
          callId 
        });
        return {
          success: false,
          error: `PERMISSION DENIED: ${perm.reason}`
        };
      }

      globalEventBus.emit('tool.started', { 
        toolName: 'apply_patch', 
        input: { filePath, patchLength: patch.length },
        callId 
      });

      // Lire le contenu actuel
      const currentContent = await this.provider.readFile(filePath);
      
      // Analyser le patch
      const lines = patch.split('\n');
      const removeLines = lines.filter((l) => l.startsWith('-') && !l.startsWith('---')).map((l) => l.slice(1));
      const addLines = lines.filter((l) => l.startsWith('+') && !l.startsWith('+++')).map((l) => l.slice(1));
      
      // Appliquer le patch
      let newContent = currentContent;
      if (removeLines.length > 0 && addLines.length > 0) {
        const target = removeLines.join('\n');
        const replacement = addLines.join('\n');
        
        if (currentContent.includes(target)) {
          newContent = currentContent.replace(target, replacement);
        } else {
          throw new Error(`Patch target not found in ${filePath}`);
        }
      } else if (addLines.length > 0) {
        // Si c'est juste du contenu à ajouter (pas de suppression)
        newContent = patch;
      }
      
      // Écrire le nouveau contenu
      await this.provider.writeFile(filePath, newContent);
      
      // VÉRIFICATION PHYSIQUE
      const verifiedContent = await this.provider.readFile(filePath);
      
      if (verifiedContent !== newContent) {
        throw new Error(`Patch verification failed on ${filePath}`);
      }

      globalEventBus.emit('file.changed', { 
        path: filePath, 
        action: 'patch' 
      });

      const result: FileSystemToolResult = {
        success: true,
        output: `[SUCCESS] Applied and verified patch on ${filePath}.`,
        metadata: {
          filePath,
          linesAdded: addLines.length,
          linesRemoved: removeLines.length
        },
        verified: true
      };

      globalEventBus.emit('tool.completed', { 
        toolName: 'apply_patch', 
        output: result.output,
        callId,
        metadata: result.metadata 
      });

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      globalEventBus.emit('tool.failed', { 
        toolName: 'apply_patch', 
        error: errorMessage,
        callId 
      });

      return {
        success: false,
        error: `Failed to apply patch: ${errorMessage}`
      };
    }
  }

  /**
   * Lister les fichiers et répertoires
   * 
   * @param directoryPath - Répertoire à lister (optionnel, racine par défaut)
   * @param recursive - Lister récursivement (optionnel)
   * @param includeHidden - Inclure les fichiers cachés (optionnel)
   * @returns Liste des entrées
   */
  async listFiles(
    directoryPath: string = '',
    recursive: boolean = false,
    includeHidden: boolean = false
  ): Promise<FileSystemToolResult> {
    const callId = `list-${Date.now()}`;
    
    try {
      // Vérifier les permissions
      const perm = permissionsManager.checkPermission('read', 'list_files', { directoryPath });
      if (!perm.allowed) {
        globalEventBus.emit('permission.denied', { 
          toolName: 'list_files', 
          reason: perm.reason,
          callId 
        });
        return {
          success: false,
          error: `PERMISSION DENIED: ${perm.reason}`
        };
      }

      globalEventBus.emit('tool.started', { 
        toolName: 'list_files', 
        input: { directoryPath, recursive, includeHidden },
        callId 
      });

      // Lister les fichiers via le provider
      const entries = await this.provider.listFiles(directoryPath);
      
      if (entries.length === 0) {
        const result: FileSystemToolResult = {
          success: true,
          output: `(Workspace directory is empty)`,
          metadata: { count: 0 }
        };

        globalEventBus.emit('tool.completed', { 
          toolName: 'list_files', 
          output: result.output,
          callId,
          metadata: result.metadata 
        });

        return result;
      }

      // Filtrer les fichiers cachés si nécessaire
      const filteredEntries = includeHidden 
        ? entries 
        : entries.filter(e => !e.name.startsWith('.'));

      // Formater les entrées
      const formatted = filteredEntries
        .map((e: FileEntry) => {
          const prefix = e.isDirectory ? '[DIR] ' : '      ';
          const sizeStr = e.isDirectory ? '' : ` (${e.sizeBytes} B)`;
          return `${prefix}${e.path}${sizeStr}`;
        })
        .join('\n');

      const result: FileSystemToolResult = {
        success: true,
        output: `Found ${filteredEntries.length} items in workspace:\n${formatted}`,
        metadata: {
          count: filteredEntries.length,
          directoryPath,
          recursive,
          includeHidden
        }
      };

      globalEventBus.emit('tool.completed', { 
        toolName: 'list_files', 
        output: result.output,
        callId,
        metadata: result.metadata 
      });

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      globalEventBus.emit('tool.failed', { 
        toolName: 'list_files', 
        error: errorMessage,
        callId 
      });

      return {
        success: false,
        error: `Failed to list files: ${errorMessage}`
      };
    }
  }

  /**
   * Rechercher des fichiers par pattern glob
   * 
   * @param pattern - Pattern glob (ex: glob pattern comme *.tsx ou *.json)
   * @param directoryPath - Répertoire de base (optionnel)
   * @param caseSensitive - Sensible à la casse (optionnel)
   * @returns Fichiers correspondants
   */
  async globFiles(
    pattern: string,
    directoryPath: string = '',
    caseSensitive: boolean = false
  ): Promise<FileSystemToolResult> {
    const callId = `glob-${Date.now()}`;
    
    try {
      // Vérifier les permissions
      const perm = permissionsManager.checkPermission('read', 'glob_files', { pattern });
      if (!perm.allowed) {
        globalEventBus.emit('permission.denied', { 
          toolName: 'glob_files', 
          reason: perm.reason,
          callId 
        });
        return {
          success: false,
          error: `PERMISSION DENIED: ${perm.reason}`
        };
      }

      globalEventBus.emit('tool.started', { 
        toolName: 'glob_files', 
        input: { pattern, directoryPath, caseSensitive },
        callId 
      });

      // Lister tous les fichiers
      const allEntries = await this.provider.listFiles(directoryPath);
      
      // Filtrer par pattern
      const normalizedPattern = pattern.toLowerCase();
      const matched = allEntries.filter((entry: FileEntry) => {
        if (entry.isDirectory) return false;
        
        const entryPath = caseSensitive ? entry.path : entry.path.toLowerCase();
        const cleanPattern = normalizedPattern.replace(/^\*\*\//, '').replace(/^\*/, '');
        
        return entryPath.includes(cleanPattern) || 
               entry.name.toLowerCase().includes(cleanPattern);
      });

      if (matched.length === 0) {
        const result: FileSystemToolResult = {
          success: true,
          output: `No files matched pattern "${pattern}".`,
          metadata: { count: 0, pattern }
        };

        globalEventBus.emit('tool.completed', { 
          toolName: 'glob_files', 
          output: result.output,
          callId,
          metadata: result.metadata 
        });

        return result;
      }

      const result: FileSystemToolResult = {
        success: true,
        output: `Matched ${matched.length} files for pattern "${pattern}":\n${matched.map((m: FileEntry) => m.path).join('\n')}`,
        metadata: {
          count: matched.length,
          pattern,
          files: matched.map((m: FileEntry) => m.path)
        }
      };

      globalEventBus.emit('tool.completed', { 
        toolName: 'glob_files', 
        output: result.output,
        callId,
        metadata: result.metadata 
      });

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      globalEventBus.emit('tool.failed', { 
        toolName: 'glob_files', 
        error: errorMessage,
        callId 
      });

      return {
        success: false,
        error: `Failed to glob files: ${errorMessage}`
      };
    }
  }

  /**
   * Rechercher un pattern dans les fichiers (grep)
   * 
   * @param query - Pattern à rechercher
   * @param path - Répertoire de base (optionnel)
   * @param caseSensitive - Sensible à la casse (optionnel)
   * @param useRegex - Utiliser les expressions régulières (optionnel)
   * @param maxMatches - Nombre max de correspondances (optionnel)
   * @returns Correspondances trouvées
   */
  async grepSearch(
    query: string,
    path: string = '',
    caseSensitive: boolean = false,
    useRegex: boolean = false,
    maxMatches: number = 50
  ): Promise<FileSystemToolResult> {
    const callId = `grep-${Date.now()}`;
    
    try {
      // Vérifier les permissions
      const perm = permissionsManager.checkPermission('read', 'grep_search', { query, path });
      if (!perm.allowed) {
        globalEventBus.emit('permission.denied', { 
          toolName: 'grep_search', 
          reason: perm.reason,
          callId 
        });
        return {
          success: false,
          error: `PERMISSION DENIED: ${perm.reason}`
        };
      }

      globalEventBus.emit('tool.started', { 
        toolName: 'grep_search', 
        input: { query, path, caseSensitive, useRegex, maxMatches },
        callId 
      });

      if (!query) {
        const result: FileSystemToolResult = {
          success: false,
          error: 'Query parameter is required'
        };

        globalEventBus.emit('tool.failed', { 
          toolName: 'grep_search', 
          error: result.error,
          callId 
        });

        return result;
      }

      // Lister les fichiers dans le répertoire
      const entries = await this.provider.listFiles(path);
      const matches: string[] = [];

      for (const entry of entries) {
        if (entry.isDirectory) continue;
        
        try {
          const content = await this.provider.readFile(entry.path);
          const lines = content.split('\n');
          
          lines.forEach((line, idx) => {
            if (matches.length >= maxMatches) return;
            
            const lineToCheck = caseSensitive ? line : line.toLowerCase();
            const queryToCheck = caseSensitive ? query : query.toLowerCase();
            
            // Recherche simple ou regex
            if (useRegex) {
              try {
                const regex = new RegExp(queryToCheck, caseSensitive ? '' : 'i');
                if (regex.test(lineToCheck)) {
                  matches.push(`${entry.path}:${idx + 1}: ${line.trim()}`);
                }
              } catch (e) {
                // Regex invalide, faire une recherche simple
                if (lineToCheck.includes(queryToCheck)) {
                  matches.push(`${entry.path}:${idx + 1}: ${line.trim()}`);
                }
              }
            } else {
              if (lineToCheck.includes(queryToCheck)) {
                matches.push(`${entry.path}:${idx + 1}: ${line.trim()}`);
              }
            }
          });
        } catch {
          // Ignorer les erreurs de lecture
        }
      }

      if (matches.length === 0) {
        const result: FileSystemToolResult = {
          success: true,
          output: `No occurrences of "${query}" found.`,
          metadata: { count: 0, query }
        };

        globalEventBus.emit('tool.completed', { 
          toolName: 'grep_search', 
          output: result.output,
          callId,
          metadata: result.metadata 
        });

        return result;
      }

      const result: FileSystemToolResult = {
        success: true,
        output: `Found ${matches.length} matches for "${query}":\n${matches.join('\n')}`,
        metadata: {
          count: matches.length,
          query,
          path,
          truncated: matches.length >= maxMatches
        }
      };

      globalEventBus.emit('tool.completed', { 
        toolName: 'grep_search', 
        output: result.output,
        callId,
        metadata: result.metadata 
      });

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      globalEventBus.emit('tool.failed', { 
        toolName: 'grep_search', 
        error: errorMessage,
        callId 
      });

      return {
        success: false,
        error: `Failed to grep: ${errorMessage}`
      };
    }
  }

  /**
   * Supprimer un fichier
   * 
   * @param filePath - Chemin du fichier à supprimer
   * @returns Résultat de la suppression
   */
  async deleteFile(filePath: string): Promise<FileSystemToolResult> {
    const callId = `delete-${Date.now()}`;
    
    try {
      // Vérifier les permissions
      const perm = permissionsManager.checkPermission('build', 'delete_file', { filePath });
      if (!perm.allowed) {
        globalEventBus.emit('permission.denied', { 
          toolName: 'delete_file', 
          reason: perm.reason,
          callId 
        });
        return {
          success: false,
          error: `PERMISSION DENIED: ${perm.reason}`
        };
      }

      globalEventBus.emit('tool.started', { 
        toolName: 'delete_file', 
        input: { filePath },
        callId 
      });

      // Supprimer le fichier
      await this.provider.deleteFile(filePath);
      
      // VÉRIFICATION PHYSIQUE: Vérifier que le fichier n'existe plus
      try {
        await this.provider.readFile(filePath);
        throw new Error(`File still exists after deletion: ${filePath}`);
      } catch (readError) {
        // Le fichier ne devrait plus exister, c'est normal
        if (!((readError as Error).message.includes('ENOENT') || 
              (readError as Error).message.includes('not found'))) {
          throw readError;
        }
      }

      globalEventBus.emit('file.changed', { 
        path: filePath, 
        action: 'delete' 
      });

      const result: FileSystemToolResult = {
        success: true,
        output: `[SUCCESS] File deleted: ${filePath}`,
        metadata: { filePath },
        verified: true
      };

      globalEventBus.emit('tool.completed', { 
        toolName: 'delete_file', 
        output: result.output,
        callId,
        metadata: result.metadata 
      });

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      globalEventBus.emit('tool.failed', { 
        toolName: 'delete_file', 
        error: errorMessage,
        callId 
      });

      return {
        success: false,
        error: `Failed to delete file: ${errorMessage}`
      };
    }
  }

  /**
   * Créer un répertoire
   * 
   * @param directoryPath - Chemin du répertoire à créer
   * @returns Résultat de la création
   */
  async createDirectory(directoryPath: string): Promise<FileSystemToolResult> {
    const callId = `mkdir-${Date.now()}`;
    
    try {
      // Vérifier les permissions
      const perm = permissionsManager.checkPermission('build', 'create_directory', { directoryPath });
      if (!perm.allowed) {
        globalEventBus.emit('permission.denied', { 
          toolName: 'create_directory', 
          reason: perm.reason,
          callId 
        });
        return {
          success: false,
          error: `PERMISSION DENIED: ${perm.reason}`
        };
      }

      globalEventBus.emit('tool.started', { 
        toolName: 'create_directory', 
        input: { directoryPath },
        callId 
      });

      // Créer le répertoire
      if (this.provider.createDirectory) {
        await this.provider.createDirectory(directoryPath);
      } else {
        await this.provider.executeCommand(`mkdir -p "${directoryPath}"`);
      }
      
      // VÉRIFICATION PHYSIQUE: Vérifier que le répertoire existe
      const entries = await this.provider.listFiles(directoryPath);
      // Si le répertoire existe, listFiles devrait retourner quelque chose (même vide)
      
      const result: FileSystemToolResult = {
        success: true,
        output: `[SUCCESS] Directory created: ${directoryPath}`,
        metadata: { directoryPath },
        verified: true
      };

      globalEventBus.emit('tool.completed', { 
        toolName: 'create_directory', 
        output: result.output,
        callId,
        metadata: result.metadata 
      });

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      globalEventBus.emit('tool.failed', { 
        toolName: 'create_directory', 
        error: errorMessage,
        callId 
      });

      return {
        success: false,
        error: `Failed to create directory: ${errorMessage}`
      };
    }
  }

  /**
   * Déplacer/renommer un fichier
   * 
   * @param sourcePath - Chemin source
   * @param targetPath - Chemin cible
   * @returns Résultat du déplacement
   */
  async moveFile(sourcePath: string, targetPath: string): Promise<FileSystemToolResult> {
    const callId = `move-${Date.now()}`;
    
    try {
      // Vérifier les permissions
      const perm = permissionsManager.checkPermission('build', 'move_file', { 
        sourcePath, 
        targetPath 
      });
      if (!perm.allowed) {
        globalEventBus.emit('permission.denied', { 
          toolName: 'move_file', 
          reason: perm.reason,
          callId 
        });
        return {
          success: false,
          error: `PERMISSION DENIED: ${perm.reason}`
        };
      }

      globalEventBus.emit('tool.started', { 
        toolName: 'move_file', 
        input: { sourcePath, targetPath },
        callId 
      });

      // Lire le contenu source pour vérification
      const content = await this.provider.readFile(sourcePath);
      
      // Déplacer le fichier
      if (this.provider.moveFile) {
        await this.provider.moveFile(sourcePath, targetPath);
      } else {
        await this.provider.executeCommand(`mv "${sourcePath}" "${targetPath}"`);
      }
      
      // VÉRIFICATION PHYSIQUE
      const verifiedContent = await this.provider.readFile(targetPath);
      
      if (verifiedContent !== content) {
        throw new Error(`Move verification failed: content mismatch for ${targetPath}`);
      }

      // Vérifier que le fichier source n'existe plus
      try {
        await this.provider.readFile(sourcePath);
        throw new Error(`Source file still exists after move: ${sourcePath}`);
      } catch (readError) {
        if (!((readError as Error).message.includes('ENOENT') || 
              (readError as Error).message.includes('not found'))) {
          throw readError;
        }
      }

      globalEventBus.emit('file.changed', { 
        path: sourcePath, 
        newPath: targetPath,
        action: 'move' 
      });

      const result: FileSystemToolResult = {
        success: true,
        output: `[SUCCESS] File moved: ${sourcePath} -> ${targetPath}`,
        metadata: { sourcePath, targetPath },
        verified: true
      };

      globalEventBus.emit('tool.completed', { 
        toolName: 'move_file', 
        output: result.output,
        callId,
        metadata: result.metadata 
      });

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      globalEventBus.emit('tool.failed', { 
        toolName: 'move_file', 
        error: errorMessage,
        callId 
      });

      return {
        success: false,
        error: `Failed to move file: ${errorMessage}`
      };
    }
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
  }
}

/**
 * Créer une instance des Filesystem Tools
 */
export function createFilesystemTools(provider: ExecutionProvider): FilesystemTools {
  return new FilesystemTools(provider);
}
