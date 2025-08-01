// src/core/services/renderer/render.service.ts

import Handlebars from 'handlebars';
import type { LocalSiteData, PageResolutionResult } from '@/core/types';
import { PageType } from '@/core/types';
import { getAssetContent, getLayoutManifest } from '@/core/services/config/configHelpers.service';
import { getActiveImageService } from '@/core/services/images/images.service';
import { getMergedThemeDataForForm } from '@/core/services/config/theme.service';
import { prepareRenderEnvironment } from './asset.service';
import { assemblePageContext, assembleBaseContext } from './context.service';
import { getCollectionContent } from '@/core/services/collections.service';

/**
 * Defines the options passed to the main render function.
 */
export interface RenderOptions {
    siteRootPath: string;
    isExport: boolean;
    relativeAssetPath?: string;
}

/**

 * Renders a resolved page into a full HTML string. This is the primary
 * orchestration function for the entire rendering pipeline.
 */
export async function render(
    siteData: LocalSiteData,
    resolution: PageResolutionResult,
    options: RenderOptions
): Promise<string> {
    if (resolution.type === PageType.NotFound) {
        return `<h1>404 - Not Found</h1><p>${resolution.errorMessage}</p>`;
    }

    // 1. Synchronize Data and Prepare Handlebars Environment
    const { initialConfig: finalMergedConfig } = await getMergedThemeDataForForm(siteData.manifest.theme.name, siteData.manifest.theme.config);
    const synchronizedSiteData = { ...siteData, manifest: { ...siteData.manifest, theme: { ...siteData.manifest.theme, config: finalMergedConfig }}};
    await prepareRenderEnvironment(synchronizedSiteData);

    // 2. Get Services and Manifests
    const imageService = getActiveImageService(synchronizedSiteData.manifest);
    const pageLayoutManifest = await getLayoutManifest(synchronizedSiteData, resolution.layoutPath);
    if (!pageLayoutManifest) {
      throw new Error(`Layout manifest not found for layout: "${resolution.layoutPath}"`);
    }

    // 2.5. Populate collection items for collection layout types
    let enrichedResolution = resolution;
    if (pageLayoutManifest.layoutType === 'collection') {
      const layoutConfig = resolution.contentFile.frontmatter.layoutConfig;
      if (layoutConfig && layoutConfig.collectionId) {
        const collectionItems = getCollectionContent(synchronizedSiteData, layoutConfig.collectionId);
        enrichedResolution = {
          ...resolution,
          collectionItems
        };
      }
    }

    // 3. Assemble Data Contexts for the Templates
    const pageContext = await assemblePageContext(synchronizedSiteData, enrichedResolution, options, imageService, pageLayoutManifest);
    const baseContext = await assembleBaseContext(synchronizedSiteData, enrichedResolution, options, imageService, pageContext);

    // 4. Compile and Render the Main Body Content
    // The template path is determined by the layout type.
    const bodyTemplatePath = pageLayoutManifest.layoutType === 'collection' ? 'index.hbs' : 'index.hbs';
    const bodyTemplateSource = await getAssetContent(synchronizedSiteData, 'layout', enrichedResolution.layoutPath, bodyTemplatePath);
    if (!bodyTemplateSource) throw new Error(`Body template not found: layouts/${enrichedResolution.layoutPath}/${bodyTemplatePath}`);

    // Handle page content - process directives if present, otherwise render standard markdown
    let bodyHtml: string;
    
    // Check if content contains directives that need to be processed
    const contentHasDirectives = /::[\w-]+(?:\{[^}]*\})?/.test(enrichedResolution.contentFile.content);
    
    if (contentHasDirectives) {
        // Parse and render directives in the content
        const { DirectiveRenderHelper } = await import('./helpers/directiveRender.helper');
        const { DEFAULT_BLOCKS } = await import('@/config/defaultBlocks');
        
        const directiveHelper = new DirectiveRenderHelper(synchronizedSiteData.manifest, DEFAULT_BLOCKS);
        
        try {
            // Parse directives to blocks and render them
            const parsedBlocks = await directiveHelper.directiveMarkdownToBlocks(enrichedResolution.contentFile.content);
            const renderedBlocksHtml = await directiveHelper.preRenderBlocks(parsedBlocks, synchronizedSiteData);
            
            const blockContext = {
                ...pageContext,
                blocks: renderedBlocksHtml,
                content: renderedBlocksHtml // Also set content for template compatibility
            };
            bodyHtml = await Handlebars.compile(bodyTemplateSource)(blockContext);
        } catch (directiveError) {
            console.error('Error processing directives in content:', directiveError);
            // Fallback to standard markdown rendering
            bodyHtml = await Handlebars.compile(bodyTemplateSource)(pageContext);
        }
    } else {
        // Standard markdown content rendering
        bodyHtml = await Handlebars.compile(bodyTemplateSource)(pageContext);
    }

    // 5. Compile and Render the Final Page Shell (base.hbs)
    const baseTemplateSource = await getAssetContent(synchronizedSiteData, 'theme', synchronizedSiteData.manifest.theme.name, 'base.hbs');
    if (!baseTemplateSource) throw new Error('Base theme template (base.hbs) not found.');

    const finalContextWithBody = { ...baseContext, body: new Handlebars.SafeString(bodyHtml) };
    return await Handlebars.compile(baseTemplateSource)(finalContextWithBody);
}