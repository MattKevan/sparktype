// src/pages/sites/edit/EditContentPage.tsx

import { useMemo, useEffect, useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';

// Global State and UI Management
import { useUIStore } from '@/core/state/uiStore';
import { useAppStore } from '@/core/state/useAppStore';
import { type AppStore } from '@/core/state/useAppStore';
import { type MarkdownFrontmatter } from '@/core/types';

// UI Components
import { Button } from '@/core/components/ui/button';
import { FilePlus, Loader2 } from 'lucide-react';
import ThreeColumnLayout from '@/core/components/layout/ThreeColumnLayout';
import LeftSidebar from '@/features/editor/components/LeftSidebar';
import NewPageDialog from '@/features/editor/components/NewPageDialog';
// import CreateCollectionPageDialog from '@/features/editor/components/CreateCollectionPageDialog';
import { FullSparkBlockEditor } from '@/packages/sparkblock/components/FullSparkBlockEditor';
import { createSparktypeBlockAdapter } from '@/features/editor/adapters/SparktypeBlockAdapter';
// import '@/packages/sparkblock/styles/sparkblock.css';
import FrontmatterSidebar from '@/features/editor/components/FrontmatterSidebar';
import PrimaryContentFields from '@/features/editor/components/PrimaryContentFields';
import CollectionItemList from '@/features/editor/components/CollectionItemList';
import SaveButton from '@/features/editor/components/SaveButton';

// Modular Hooks
import { usePageIdentifier } from '@/features/editor/hooks/usePageIdentifier';
import { useFileContent } from '@/features/editor/hooks/useFileContent';
import { useFilePersistence } from '@/features/editor/hooks/useFilePersistence';
import { useEditor } from '@/features/editor/contexts/useEditor';
// Markdown utilities are handled by SparkBlock adapter

/**
 * A loading skeleton specifically for the main editor content area.
 */
function EditorLoadingSkeleton() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-6">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      <p className="text-muted-foreground">Loading Editor...</p>
    </div>
  );
}

/**
 * The internal component that contains the core editor logic and UI.
 */
function EditContentPageInternal() {

  // --- 1. Get Data and Identifiers ---
  const { siteId = '' } = useParams<{ siteId: string }>();
  const site = useAppStore(useCallback((state: AppStore) => state.getSiteById(siteId), [siteId]));

  const siteStructure = useMemo(() => site?.manifest.structure || [], [site?.manifest.structure]);
  const allContentFiles = useMemo(() => site?.contentFiles || [], [site?.contentFiles]);
  
  const { isNewFileMode, filePath } = usePageIdentifier({ siteStructure, allContentFiles });
  const { status, frontmatter, initialMarkdown, slug, setSlug, handleFrontmatterChange } = useFileContent(siteId, filePath, isNewFileMode);
  
  // State to track the current markdown content (SparkBlock will edit this directly)
  const [currentMarkdown, setCurrentMarkdown] = useState<string>('');
  
  // Initialize and sync with file content
  useEffect(() => {
    if (initialMarkdown !== undefined) {
      setCurrentMarkdown(initialMarkdown);
    }
  }, [initialMarkdown]);

  const { handleDelete } = useFilePersistence({ 
    siteId, 
    filePath, 
    isNewFileMode, 
    frontmatter, 
    slug, 
    getEditorContent: () => currentMarkdown,
    hasBlocks: false // SparkBlock editor handles block logic internally
  });

  // Create SparkBlock adapter
  const sparkBlockAdapter = useMemo(() => {
    if (!site?.manifest) {
      console.log('No site manifest available for SparkBlock adapter');
      return null;
    }
    console.log('Creating SparkBlock adapter with manifest:', site.manifest.title);
    return createSparktypeBlockAdapter(site.manifest);
  }, [site?.manifest]);

  // Get editor context for change detection
  const { setHasUnsavedChanges } = useEditor();

  // Handle markdown content changes from SparkBlock
  const handleMarkdownChange = useCallback((newMarkdown: string) => {
    setCurrentMarkdown(newMarkdown);
    // Trigger change detection for autosave
    setHasUnsavedChanges(true);
  }, [setHasUnsavedChanges]);

  // --- 2. Manage Sidebars via UI Store ---
  const { leftSidebarContent, rightSidebarContent, setLeftAvailable, setRightAvailable, setLeftSidebarContent, setRightSidebarContent } = useUIStore(state => state.sidebar);

  const rightSidebarComponent = useMemo(() => {
    // FIX #1: Add a guard for `site` itself. This narrows the type of `site`
    // for all subsequent accesses (e.g., `site.manifest`), resolving the errors.
    if (status !== 'ready' || !frontmatter || !siteId || !site) {
      return null;
    }
    
    return (
      <FrontmatterSidebar
        siteId={siteId}
        filePath={filePath}
        manifest={site.manifest}
        layoutFiles={site.layoutFiles}
        themeFiles={site.themeFiles}
        frontmatter={frontmatter}
        onFrontmatterChange={handleFrontmatterChange}
        isNewFileMode={isNewFileMode}
        slug={slug}
        onSlugChange={setSlug}
        onDelete={handleDelete}
      />
    );
  }, [status, frontmatter, site, siteId, filePath, allContentFiles, handleFrontmatterChange, isNewFileMode, slug, setSlug, handleDelete]);

  useEffect(() => {
    setLeftAvailable(true);
    setLeftSidebarContent(<LeftSidebar />);
    return () => { setLeftAvailable(false); setLeftSidebarContent(null); };
  }, [setLeftAvailable, setLeftSidebarContent]);

  useEffect(() => {
    if (rightSidebarComponent) {
      setRightAvailable(true);
      setRightSidebarContent(rightSidebarComponent);
    } else {
      setRightAvailable(false);
      setRightSidebarContent(null);
    }
    return () => { setRightAvailable(false); setRightSidebarContent(null); };
  }, [rightSidebarComponent, setRightAvailable, setRightSidebarContent]);

  const currentLayout = useMemo(() => {
    if (!frontmatter?.layout || !site?.layoutFiles) return null;
    
    return frontmatter.layoutConfig ? { layoutType: 'collection' } : { layoutType: 'single' };
  }, [frontmatter, site?.layoutFiles]);

  // --- 3. Determine Page State for Rendering ---
  const isCollectionListingPage = currentLayout?.layoutType === 'collection';
  const isSiteEmpty = siteId && siteStructure.length === 0 && !isNewFileMode;

  const pageTitle = status === 'ready' && frontmatter?.title 
    ? `Editing: ${frontmatter.title} | ${site?.manifest.title || 'Sparktype'}` 
    : `Editor - ${site?.manifest.title || 'Sparktype'}`;

  const headerActions = isSiteEmpty ? null : <SaveButton />;

  // --- 4. Render the UI ---
  return (
    <>
      <title>{pageTitle}</title>
      <ThreeColumnLayout
        leftSidebar={leftSidebarContent}
        rightSidebar={isSiteEmpty ? null : rightSidebarContent}
        headerActions={headerActions}
      >
        {isSiteEmpty ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8 bg-white dark:bg-gray-900">
            <h2 className="text-2xl font-bold mb-2">Create Your Homepage</h2>
            <p className="text-muted-foreground mb-6 max-w-md">Your site is empty. The first page you create will become the site's permanent homepage.</p>
            <div className="flex gap-4">
              <NewPageDialog siteId={siteId}><Button size="lg"><FilePlus className="mr-2 h-5 w-5" /> Create Content Page</Button></NewPageDialog>
              {/* <CreateCollectionPageDialog siteId={siteId}><Button size="lg" variant="outline"><LayoutGrid className="mr-2 h-5 w-5" /> Create Collection Page</Button></CreateCollectionPageDialog> */}
            </div>
          </div>
        ) : (
          (() => {
            if (status !== 'ready' || !frontmatter) {
              return <EditorLoadingSkeleton />;
            }
            return (
              <div className='flex h-full w-full flex-col'>
                <div className='container mx-auto flex h-full max-w-[960px] flex-col p-6'>
                  <div className="shrink-0">
                    <PrimaryContentFields 
                      frontmatter={{ 
                        title: frontmatter.title, 
                        // FIX #2: Add a type assertion to safely pass the description.
                        // We know it's a string from the schema, so this is safe.
                        description: frontmatter.description as string | undefined
                      }} 
                      onFrontmatterChange={handleFrontmatterChange as (newData: Partial<MarkdownFrontmatter>) => void} 
                    />
                  </div>
                  <div className="mt-6 flex-grow min-h-0">
                    {isCollectionListingPage && frontmatter.layoutConfig?.collectionId ? (
                      <CollectionItemList siteId={siteId} collectionId={frontmatter.layoutConfig.collectionId} />
                    ) : (
                      <FullSparkBlockEditor
                        adapter={sparkBlockAdapter}
                        value={currentMarkdown}
                        onChange={handleMarkdownChange}
                        readonly={false}
                      />
                    )}
                  </div>
                </div>
              </div>
            );
          })()
        )}
      </ThreeColumnLayout>
    </>
  );
}

/**
 * The final exported component with the new SparkBlock editor.
 */
export default function EditContentPage() {
  return <EditContentPageInternal />;
}