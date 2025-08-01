// src/core/services/renderer/helpers/modularRender.helper.ts

import Handlebars from 'handlebars';
import type { Block, LocalSiteData, Manifest } from '@/core/types';
import { getAssetContent } from '@/core/services/config/configHelpers.service';
import { getCollectionContent } from '@/core/services/collections.service';

/**
 * Modular rendering system for custom blocks.
 * Instead of block-specific renderers, this uses modular component functions
 * that can be composed together based on block manifest definitions.
 */

/**
 * Interface for a modular component renderer
 */
interface ComponentRenderer {
  render(context: RenderContext, config: any): Promise<string>;
}

/**
 * Context passed to all component renderers
 */
interface RenderContext {
  block: Block;
  siteData: LocalSiteData;
  manifest: Manifest;
  blockManifest: any;
  utils: RenderUtils;
}

/**
 * Utility functions available to all renderers
 */
interface RenderUtils {
  escapeHtml: (text: string) => string;
  formatDate: (date: string) => string;
  slugify: (text: string) => string;
  truncate: (text: string, length: number) => string;
  loadTemplate: (templatePath: string) => Promise<string | null>;
}

/**
 * Text component renderer - handles basic text content
 */
class TextRenderer implements ComponentRenderer {
  async render(context: RenderContext, config: any): Promise<string> {
    const text = String(config.content || config.text || '');
    const format = config.format || 'plain';
    
    switch (format) {
      case 'markdown':
        // Simple markdown formatting
        return text
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.*?)\*/g, '<em>$1</em>')
          .replace(/`(.*?)`/g, '<code>$1</code>');
      
      case 'html':
        return text; // Already HTML, pass through
      
      default: // plain
        return context.utils.escapeHtml(text);
    }
  }
}

/**
 * Image component renderer - handles image display
 */
class ImageRenderer implements ComponentRenderer {
  async render(context: RenderContext, config: any): Promise<string> {
    const src = context.utils.escapeHtml(String(config.src || ''));
    const alt = context.utils.escapeHtml(String(config.alt || ''));
    const width = config.width ? ` width="${config.width}"` : '';
    const height = config.height ? ` height="${config.height}"` : '';
    const caption = config.caption ? context.utils.escapeHtml(String(config.caption)) : '';
    
    let html = `<img src="${src}" alt="${alt}"${width}${height} />`;
    
    if (caption) {
      html = `<figure>
        ${html}
        <figcaption>${caption}</figcaption>
      </figure>`;
    }
    
    return html;
  }
}

/**
 * Collection component renderer - handles collection data display
 */
class CollectionRenderer implements ComponentRenderer {
  async render(context: RenderContext, config: any): Promise<string> {
    console.log('[CollectionRenderer] Starting render with config:', config);
    
    const collectionId = String(config.collectionId || '');
    const layout = String(config.layout || 'list');
    const maxItems = Number(config.maxItems || 10);
    const sortBy = String(config.sortBy || 'date');
    const sortOrder = String(config.sortOrder || 'desc') as 'asc' | 'desc';
    
    console.log('[CollectionRenderer] Collection config:', { collectionId, layout, maxItems, sortBy, sortOrder });
    
    if (!collectionId) {
      console.log('[CollectionRenderer] No collection ID provided');
      return '<div class="collection-empty">No collection specified</div>';
    }
    
    try {
      console.log('[CollectionRenderer] Getting collection content...');
      // Get collection items
      let items = getCollectionContent(context.siteData, collectionId);
      console.log('[CollectionRenderer] Found items:', items.length);
      
      if (!items || items.length === 0) {
        return `<div class="collection-empty">No items found in collection "${context.utils.escapeHtml(collectionId)}"</div>`;
      }
      
      // Apply sorting
      items = this.sortItems(items, sortBy, sortOrder);
      
      // Apply max items limit
      if (maxItems > 0) {
        items = items.slice(0, maxItems);
      }
      
      // Render items based on layout
      return this.renderItems(items, layout, context.utils);
      
    } catch (error) {
      console.error('[CollectionRenderer] Error rendering collection:', error);
      return `<div class="collection-error">Error loading collection "${context.utils.escapeHtml(collectionId)}"</div>`;
    }
  }
  
  private sortItems(items: any[], sortBy: string, sortOrder: 'asc' | 'desc'): any[] {
    return [...items].sort((a, b) => {
      let aValue: any;
      let bValue: any;
      
      switch (sortBy) {
        case 'date':
          aValue = new Date(a.frontmatter.date || 0);
          bValue = new Date(b.frontmatter.date || 0);
          break;
        case 'title':
          aValue = String(a.frontmatter.title || '').toLowerCase();
          bValue = String(b.frontmatter.title || '').toLowerCase();
          break;
        case 'order':
          aValue = Number(a.frontmatter.order || 999999);
          bValue = Number(b.frontmatter.order || 999999);
          break;
        default:
          aValue = String(a.frontmatter[sortBy] || '').toLowerCase();
          bValue = String(b.frontmatter[sortBy] || '').toLowerCase();
          break;
      }
      
      let comparison = 0;
      if (aValue < bValue) comparison = -1;
      else if (aValue > bValue) comparison = 1;
      
      return sortOrder === 'desc' ? -comparison : comparison;
    });
  }
  
  private renderItems(items: any[], layout: string, utils: RenderUtils): string {
    const itemsHtml = items.map(item => {
      const url = `/${item.path.replace(/^content\//, '').replace(/\.md$/, '')}`;
      const title = utils.escapeHtml(String(item.frontmatter.title || 'Untitled'));
      const description = utils.escapeHtml(String(item.frontmatter.description || ''));
      const date = item.frontmatter.date ? new Date(String(item.frontmatter.date)).toLocaleDateString() : '';
      
      switch (layout) {
        case 'grid':
          return `<div class="collection-item collection-item-grid">
            <h4><a href="${url}">${title}</a></h4>
            ${description ? `<p>${description}</p>` : ''}
            ${date ? `<time>${date}</time>` : ''}
          </div>`;
        
        case 'cards':
          return `<div class="collection-item collection-item-card">
            <div class="card">
              <div class="card-body">
                <h4 class="card-title"><a href="${url}">${title}</a></h4>
                ${description ? `<p class="card-text">${description}</p>` : ''}
                ${date ? `<time class="card-date">${date}</time>` : ''}
              </div>
            </div>
          </div>`;
        
        default: // list
          return `<div class="collection-item collection-item-list">
            <h4><a href="${url}">${title}</a></h4>
            ${description ? `<p>${description}</p>` : ''}
            ${date ? `<time>${date}</time>` : ''}
          </div>`;
      }
    }).join('\n');
    
    return `<div class="collection-view collection-view-${layout}">
      <div class="collection-items">
        ${itemsHtml}
      </div>
    </div>`;
  }
}

/**
 * Region component renderer - handles nested block regions
 */
class RegionRenderer implements ComponentRenderer {
  constructor(private modularRenderer: ModularRenderHelper) {}
  
  async render(context: RenderContext, config: any): Promise<string> {
    const regionName = String(config.region || 'default');
    const regionBlocks = context.block.regions?.[regionName];
    
    if (!Array.isArray(regionBlocks) || regionBlocks.length === 0) {
      return `<div class="region region-${regionName} region-empty"></div>`;
    }
    
    try {
      const renderedContent = await this.modularRenderer.renderBlocks(regionBlocks, context.siteData);
      return `<div class="region region-${regionName}">
        ${renderedContent}
      </div>`;
    } catch (error) {
      console.error(`[RegionRenderer] Error rendering region ${regionName}:`, error);
      return `<div class="region region-${regionName} region-error">Error rendering region</div>`;
    }
  }
}

/**
 * Main modular rendering helper
 */
export class ModularRenderHelper {
  private componentRenderers: Map<string, ComponentRenderer>;
  private utils: RenderUtils;
  
  constructor(private manifest: Manifest) {
    this.componentRenderers = new Map();
    this.utils = this.createUtils();
    
    // Register built-in component renderers
    this.registerRenderer('text', new TextRenderer());
    this.registerRenderer('image', new ImageRenderer());
    this.registerRenderer('collection', new CollectionRenderer());
    this.registerRenderer('region', new RegionRenderer(this));
  }
  
  /**
   * Register a custom component renderer
   */
  registerRenderer(type: string, renderer: ComponentRenderer): void {
    this.componentRenderers.set(type, renderer);
  }
  
  /**
   * Render a single block using modular components
   */
  async renderBlock(block: Block, siteData: LocalSiteData, blockManifest?: any): Promise<string> {
    console.log(`[ModularRenderHelper] Rendering block ${block.type}`, block);
    
    if (!blockManifest) {
      console.log(`[ModularRenderHelper] No manifest for ${block.type}, using fallback`);
      // Fallback for core blocks without manifests
      return this.renderCoreBlockFallback(block);
    }
    
    const context: RenderContext = {
      block,
      siteData,
      manifest: this.manifest,
      blockManifest,
      utils: this.utils
    };
    
    try {
      // Check if block has a custom template
      if (blockManifest.template?.handlebars) {
        console.log(`[ModularRenderHelper] Using template for ${block.type}`);
        return await this.renderWithTemplate(context);
      }
      
      // Use modular component rendering
      console.log(`[ModularRenderHelper] Using components for ${block.type}`);
      return await this.renderWithComponents(context);
      
    } catch (error) {
      console.error(`[ModularRenderHelper] Error rendering block ${block.type}:`, error);
      return `<!-- Error rendering block ${block.type}: ${(error as Error).message} -->`;
    }
  }
  
  /**
   * Render multiple blocks
   */
  async renderBlocks(blocks: Block[], siteData: LocalSiteData): Promise<string> {
    if (!blocks || blocks.length === 0) {
      return '';
    }
    
    const renderedBlocks = await Promise.all(
      blocks.map(async (block) => {
        try {
          return await this.renderBlock(block, siteData);
        } catch (error) {
          console.error(`[ModularRenderHelper] Error rendering block ${block.id}:`, error);
          return `<!-- Error rendering block ${block.id}: ${(error as Error).message} -->`;
        }
      })
    );
    
    return renderedBlocks.join('\n');
  }
  
  /**
   * Render block using custom template
   */
  private async renderWithTemplate(context: RenderContext): Promise<string> {
    const templatePath = context.blockManifest.template.handlebars;
    console.log(`[ModularRenderHelper] Loading template: ${templatePath}`);
    
    // Load template content from site assets with timeout
    let templateContent: string | null = null;
    try {
      templateContent = await Promise.race([
        getAssetContent(context.siteData, 'block', templatePath, ''),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000))
      ]);
    } catch (error) {
      console.warn(`[ModularRenderHelper] Could not load template: ${templatePath}`, error);
    }
    
    if (!templateContent) {
      console.warn(`[ModularRenderHelper] Template not found or timed out: ${templatePath}, falling back to components`);
      return await this.renderWithComponents(context);
    }
    
    // Compile and render template
    const template = Handlebars.compile(templateContent);
    
    // Prepare template context with pre-rendered regions
    const processedRegions: Record<string, string> = {};
    if (context.block.regions && context.blockManifest.regions) {
      for (const [regionName, regionBlocks] of Object.entries(context.block.regions)) {
        if (Array.isArray(regionBlocks) && regionBlocks.length > 0) {
          processedRegions[regionName] = await this.renderBlocks(regionBlocks, context.siteData);
        } else {
          processedRegions[regionName] = '';
        }
      }
    }
    
    const templateContext = {
      ...context.block,
      regions: processedRegions,
      siteData: context.siteData,
      manifest: context.manifest,
      blockManifest: context.blockManifest,
      utils: this.utils
    };
    
    return await template(templateContext);
  }
  
  /**
   * Render block using modular components
   */
  private async renderWithComponents(context: RenderContext): Promise<string> {
    const components = context.blockManifest.components || [];
    
    if (!Array.isArray(components) || components.length === 0) {
      // No components defined, try to infer from block content
      return await this.renderInferredComponents(context);
    }
    
    const renderedComponents = await Promise.all(
      components.map(async (component: any) => {
        const renderer = this.componentRenderers.get(component.type);
        if (!renderer) {
          console.warn(`[ModularRenderHelper] Unknown component type: ${component.type}`);
          return `<!-- Unknown component: ${component.type} -->`;
        }
        
        // Merge component config with block content/config
        const config = {
          ...component.config,
          ...context.block.content,
          ...context.block.config
        };
        
        return await renderer.render(context, config);
      })
    );
    
    return renderedComponents.join('\n');
  }
  
  /**
   * Infer components from block content when not explicitly defined
   */
  private async renderInferredComponents(context: RenderContext): Promise<string> {
    const block = context.block;
    const blockType = block.type.replace('core:', '');
    
    console.log(`[ModularRenderHelper] Inferring components for ${blockType}`);
    
    // For collection_view blocks, use collection renderer
    if (blockType === 'collection_view') {
      console.log(`[ModularRenderHelper] Using collection renderer for ${blockType}`);
      const collectionRenderer = this.componentRenderers.get('collection');
      if (collectionRenderer) {
        return await collectionRenderer.render(context, {
          ...block.content,
          ...block.config
        });
      }
    }
    
    // For image blocks, use image renderer
    if (blockType === 'image') {
      const imageRenderer = this.componentRenderers.get('image');
      if (imageRenderer) {
        return await imageRenderer.render(context, block.content);
      }
    }
    
    // For container blocks with regions, use region renderer
    if (blockType === 'container' && block.regions) {
      const regionRenderer = this.componentRenderers.get('region');
      if (regionRenderer) {
        const regionHtml = await Promise.all(
          Object.keys(block.regions).map(async (regionName) => {
            return await regionRenderer.render(context, { region: regionName });
          })
        );
        
        const layout = block.content.layout || 'single';
        const gap = block.content.gap || 'medium';
        
        return `<div class="container container-${layout} gap-${gap}">
          ${regionHtml.join('')}
        </div>`;
      }
    }
    
    // Fallback to text renderer for simple blocks
    const textRenderer = this.componentRenderers.get('text');
    if (textRenderer) {
      return await textRenderer.render(context, {
        content: block.content.text || JSON.stringify(block.content)
      });
    }
    
    return `<div class="block block-${blockType}">
      <pre>${JSON.stringify(block.content, null, 2)}</pre>
    </div>`;
  }
  
  /**
   * Fallback rendering for core blocks
   */
  private renderCoreBlockFallback(block: Block): string {
    const blockType = block.type.replace('core:', '');
    
    switch (blockType) {
      case 'paragraph':
        return `<p>${this.utils.escapeHtml(String(block.content.text || ''))}</p>`;
      
      case 'heading_1':
        return `<h1>${this.utils.escapeHtml(String(block.content.text || ''))}</h1>`;
      
      case 'heading_2':
        return `<h2>${this.utils.escapeHtml(String(block.content.text || ''))}</h2>`;
      
      case 'heading_3':
        return `<h3>${this.utils.escapeHtml(String(block.content.text || ''))}</h3>`;
      
      case 'quote':
        return `<blockquote><p>${this.utils.escapeHtml(String(block.content.text || ''))}</p></blockquote>`;
      
      case 'code':
        const language = String(block.content.language || 'text');
        const code = this.utils.escapeHtml(String(block.content.code || ''));
        return `<pre><code class="language-${language}">${code}</code></pre>`;
      
      case 'unordered_list':
        return `<ul><li>${this.utils.escapeHtml(String(block.content.text || ''))}</li></ul>`;
      
      case 'ordered_list':
        return `<ol><li>${this.utils.escapeHtml(String(block.content.text || ''))}</li></ol>`;
      
      case 'divider':
        return '<hr />';
      
      default:
        return `<div class="block block-${blockType}">
          <pre>${JSON.stringify(block.content, null, 2)}</pre>
        </div>`;
    }
  }
  
  /**
   * Create utility functions
   */
  private createUtils(): RenderUtils {
    return {
      escapeHtml: (text: string) => {
        if (typeof document !== 'undefined') {
          const div = document.createElement('div');
          div.textContent = text;
          return div.innerHTML;
        }
        // Server-side fallback
        return text
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      },
      
      formatDate: (date: string) => new Date(date).toLocaleDateString(),
      
      slugify: (text: string) => text.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, ''),
      
      truncate: (text: string, length: number) => 
        text.length > length ? text.substring(0, length) + '...' : text,
      
      loadTemplate: async (templatePath: string) => {
        try {
          // Note: This requires siteData context which isn't available in utils
          // Templates should be loaded at the render level, not in utils
          console.warn(`[ModularRenderHelper] Template loading from utils not supported: ${templatePath}`);
          return null;
        } catch (error) {
          console.warn(`[ModularRenderHelper] Could not load template: ${templatePath}`, error);
          return null;
        }
      }
    };
  }
}

/**
 * Factory function for creating ModularRenderHelper
 */
export function createModularRenderHelper(manifest: Manifest): ModularRenderHelper {
  return new ModularRenderHelper(manifest);
}