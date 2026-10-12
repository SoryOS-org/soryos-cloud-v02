/**
 * @soryos/agent
 * Image Tool - Enable image input and analysis for agents
 * 
 * This tool allows agents to receive images from users
 * and process them for analysis, OCR, or design feedback.
 */

import { ToolDefinition, ToolExecutionResult } from '@soryos/schema';
import {
  ImageManager,
  ImageUploader,
  ImageUploadResult,
  ImageAnalysisResult,
  type ImageFormat,
  type ImageAnalysisType,
} from '@soryos/images';

/**
 * Image tool definition
 */
export const imageToolDefinition: ToolDefinition = {
  id: 'image_input',
  name: 'image_input',
  description: 'Receive image input from the user for analysis, OCR, or design feedback',
  category: 'web',
  parameters: {
    type: 'object',
    properties: {
      source: {
        type: 'string',
        description: 'Source of the image (file, url, clipboard, camera)',
        enum: ['file', 'url', 'clipboard', 'camera'],
      },
      analysisType: {
        type: 'string',
        description: 'Type of analysis to perform on the image',
        enum: ['description', 'ocr', 'objects', 'colors', 'layout', 'mockup', 'none'],
      },
      prompt: {
        type: 'string',
        description: 'Optional prompt for custom image analysis',
      },
      maxSizeMB: {
        type: 'number',
        description: 'Maximum image size in MB (default: 10)',
      },
      allowedFormats: {
        type: 'array',
        description: 'Allowed image formats',
        items: { type: 'string' },
      },
    },
    required: [],
  },
};

/**
 * Image tool handler
 */
export class ImageTool {
  private imageManager: ImageManager;

  constructor(imageManager?: ImageManager) {
    this.imageManager = imageManager || new ImageManager();
  }

  /**
   * Execute image input tool
   */
  async execute(params: {
    source?: string;
    analysisType?: string;
    prompt?: string;
    maxSizeMB?: number;
    allowedFormats?: string[];
  }): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      // For now, we return the upload request status
      // The actual upload is handled by the frontend
      const result: ToolExecutionResult = {
        toolName: 'image_input',
        output: JSON.stringify({
          status: 'awaiting_upload',
          source: params.source || 'file',
          analysisType: params.analysisType || 'none',
          message: `Please upload an image for ${params.analysisType || 'analysis'}`,
          timestamp: Date.now(),
        }),
        isError: false,
        metadata: {
          action: 'request_upload',
          source: params.source,
          analysisType: params.analysisType,
          maxSizeMB: params.maxSizeMB || 10,
          allowedFormats: params.allowedFormats || ['png', 'jpeg', 'jpg', 'webp', 'gif'],
        },
      };

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      return {
        toolName: 'image_input',
        output: '',
        isError: true,
        metadata: {
          action: 'error',
          error: errorMessage,
        },
      };
    }
  }

  /**
   * Process uploaded image
   */
  async processImage(
    sessionId: string,
    image: Blob | File | string,
    analysisType?: string,
    prompt?: string
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      // Delegate to the real uploader so the bytes are actually read and the
      // image dimensions are measured instead of guessed.
      const uploadResult = (await this.imageManager.upload(image, {
        sessionId,
        maxSizeMB: 10,
      })) as ImageUploadResult;

      if (!uploadResult || uploadResult.success === false) {
        throw new Error(uploadResult?.error || 'Image upload failed');
      }

      // Image analysis is not wired up yet: there is no vision provider call in
      // this package. Report the upload only rather than inventing a result.
      const requestedAnalysis = (analysisType ?? undefined) as ImageAnalysisType | undefined;

      return {
        toolName: 'image_input',
        output: JSON.stringify({
          status: 'uploaded',
          upload: {
            id: uploadResult.id,
            url: uploadResult.url,
            format: uploadResult.format,
            width: uploadResult.width,
            height: uploadResult.height,
            sizeBytes: uploadResult.sizeBytes,
          },
          analysis: {
            performed: false,
            requestedType: requestedAnalysis ?? null,
            reason: 'No vision provider is configured for this session.',
          },
          timestamp: Date.now(),
        }),
        isError: false,
        metadata: {
          action: 'process_image',
          analysisType: requestedAnalysis ?? null,
          format: uploadResult.format,
          sizeBytes: uploadResult.sizeBytes,
          sessionId,
        },
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      return {
        toolName: 'image_input',
        output: '',
        isError: true,
        metadata: {
          action: 'error',
          error: errorMessage,
          sessionId,
        },
      };
    }
  }

  /**
   * Process mockup/image for design analysis
   */
  async processMockup(
    sessionId: string,
    image: Blob | File | string,
    description?: string
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      // Upload mockup
      const uploadResult = await this.processImage(sessionId, image, 'mockup');

      // In a real implementation, we would analyze the mockup
      // and provide design feedback
      
      return {
        ...uploadResult,
        metadata: {
          ...uploadResult.metadata,
          action: 'process_mockup',
          description,
        },
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      return {
        toolName: 'image_input',
        output: '',
        isError: true,
        metadata: {
          action: 'error',
          error: errorMessage,
          sessionId,
        },
      };
    }
  }

  /**
   * Check if image input is supported
   */
  isSupported(): boolean {
    return ImageUploader.isSupported();
  }

  /**
   * Get available analysis types
   */
  getAvailableAnalysisTypes(): string[] {
    return ['description', 'ocr', 'objects', 'colors', 'layout', 'mockup', 'none'];
  }
}

/**
 * Create image tool instance
 */
export function createImageTool(imageManager?: ImageManager): ImageTool {
  return new ImageTool(imageManager);
}

/**
 * Singleton image tool instance
 */
let globalImageTool: ImageTool | null = null;

/**
 * Get or create global image tool
 */
export function getImageTool(imageManager?: ImageManager): ImageTool {
  if (!globalImageTool) {
    globalImageTool = new ImageTool(imageManager);
  }
  return globalImageTool;
}
