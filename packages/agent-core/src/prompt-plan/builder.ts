import type {
  CacheScope,
  PromptBlock,
  PromptPlan,
  ProviderCacheCapability,
} from '@byfriends/kosong';

/**
 * Cache boundary marker used to split the system prompt into cacheable blocks.
 *
 * @deprecated This marker is deprecated in favor of implicit boundaries based on section headers.
 * It is still supported for backward compatibility.
 */
const CACHE_BOUNDARY_MARKER = '__CACHE_BOUNDARY__';

/**
 * Section headers that define implicit cache boundaries.
 *
 * These headers mark natural breaks in the system prompt where cache boundaries should be placed:
 * - "# Project Information" marks the start of project-specific content
 * - "# Working Environment" marks the start of session-specific environment (OS, working directory)
 * - "# Skills" marks the start of session-specific skills listing
 */
const IMPLICIT_BOUNDARY_HEADERS = ['# Project Information', '# Working Environment', '# Skills'] as const;

/**
 * Block names by position.
 *
 * - First block (before first marker): 'base'
 * - Last block (after last marker): 'sessionContext'
 * - Intermediate blocks: Sequential names from 'projectInstructions', 'workingEnvironment', etc.
 */
const BLOCK_NAMES = [
  'base',
  'projectInstructions',
  'workingEnvironment',
  'sessionContext',
] as const;

/**
 * Get the cache scope for a block by its position.
 *
 * @param position - The block position (0-indexed)
 * @param totalBlocks - Total number of blocks
 * @returns The default cache scope for this position
 */
function getDefaultScopeForPosition(position: number, totalBlocks: number): CacheScope {
  // First block (base) is global
  if (position === 0) return 'global';

  // Last block is session
  if (position === totalBlocks - 1) return 'session';

  // Intermediate blocks are project (or session if beyond 3rd position)
  if (position === 1) return 'project';

  return 'session';
}

/**
 * Filter cache scope based on provider's supported scopes.
 *
 * @param scope - The desired cache scope
 * @param capability - The provider's cache capability
 * @returns The filtered scope (or 'none' if not supported)
 */
function filterScopeByCapability(
  scope: CacheScope,
  capability: ProviderCacheCapability,
): CacheScope {
  // If provider doesn't support caching at all, return 'none'
  if (capability.strategy === 'none') {
    return 'none';
  }

  // If supportedScopes is not defined, assume all scopes are supported
  if (capability.supportedScopes === undefined) {
    return scope;
  }

  // Check if the scope is in the supported list
  if (capability.supportedScopes.includes(scope)) {
    return scope;
  }

  // Scope not supported, fallback to 'none'
  return 'none';
}

/**
 * Find implicit boundary positions in the system prompt.
 *
 * Searches for section headers that mark natural cache boundaries.
 * Returns sorted indices of where each boundary header starts.
 *
 * @param prompt - The system prompt to search
 * @returns Array of character positions where implicit boundaries occur
 */
function findImplicitBoundaries(prompt: string): number[] {
  const boundaries: number[] = [];

  for (const header of IMPLICIT_BOUNDARY_HEADERS) {
    const index = prompt.indexOf(header);
    if (index !== -1) {
      boundaries.push(index);
    }
  }

  // Sort boundaries by position (in case headers appear out of order)
  return boundaries.toSorted((a, b) => a - b);
}

/**
 * Split prompt by implicit boundaries into blocks.
 *
 * Creates blocks based on the position of section headers that mark natural boundaries.
 * The block before the first header is the base block.
 * Blocks between headers are intermediate blocks.
 * The block after the last header is the session context block.
 *
 * @param prompt - The system prompt to split
 * @param boundaryPositions - Sorted array of boundary positions
 * @returns Array of text blocks
 */
function splitByImplicitBoundaries(prompt: string, boundaryPositions: number[]): string[] {
  if (boundaryPositions.length === 0) {
    return [prompt];
  }

  const blocks: string[] = [];
  let previousPosition = 0;

  for (const position of boundaryPositions) {
    // Add the block from previous position to this boundary
    blocks.push(prompt.slice(previousPosition, position));
    previousPosition = position;
  }

  // Add the final block (from last boundary to end)
  blocks.push(prompt.slice(previousPosition));

  return blocks;
}

/**
 * Detect if a prompt contains implicit cache boundaries.
 *
 * A prompt has implicit boundaries if it contains any of the known boundary headers.
 *
 * @param prompt - The system prompt to check
 * @returns true if implicit boundaries are detected
 */
function hasImplicitBoundaries(prompt: string): boolean {
  return IMPLICIT_BOUNDARY_HEADERS.some((header) => prompt.includes(header));
}

/**
 * Build a prompt plan from a rendered system prompt and provider cache capability.
 *
 * This function parses cache boundary markers from the system prompt and creates
 * a structured plan with named blocks, each with an appropriate cache scope.
 *
 * @param renderedSystemPrompt - The fully rendered system prompt (may contain `__CACHE_BOUNDARY__` markers)
 * @param providerCacheCapability - The provider's cache capability (for scope filtering)
 * @returns A prompt plan with cacheable blocks
 *
 * @example
 * ```ts
 * const prompt = `Base instructions
 * __CACHE_BOUNDARY__
 * Session context`;
 *
 * const capability = {
 *   strategy: 'explicit-block',
 *   supportedScopes: ['global', 'session'],
 * };
 *
 * const plan = buildPromptPlan(prompt, capability);
 * // {
 * //   blocks: [
 * //     { name: 'base', text: 'Base instructions\n', cacheScope: 'global' },
 * //     { name: 'sessionContext', text: 'Session context', cacheScope: 'session' },
 * //   ],
 * // }
 * ```
 */
/**
 * Normalize block text by handling newlines around cache boundaries.
 *
 * After splitting by `__CACHE_BOUNDARY__`, the pattern is typically:
 * - `[text]\n__CACHE_BOUNDARY__\n[next text]`
 *
 * Rules:
 * - First block: Keep as-is (preserves any trailing newline before marker)
 * - Middle blocks: Keep the newline that was between markers
 * - Last block: Trim leading newline (the one immediately after the last marker)
 *
 * @param text - The raw block text after splitting
 * @param index - The block index
 * @param totalBlocks - Total number of blocks
 * @returns Normalized block text
 */
function normalizeBlockText(text: string, index: number, totalBlocks: number): string {
  if (index === 0) {
    // First block: keep as-is (preserves trailing newline before first marker)
    return text;
  }
  if (index === totalBlocks - 1) {
    // Last block: remove leading newline (the one after the last marker)
    if (text.startsWith('\n')) {
      return text.slice(1);
    }
    return text;
  }
  // Middle blocks: keep as-is (the newline is content BETWEEN markers)
  return text;
}

export function buildPromptPlan(
  renderedSystemPrompt: string,
  providerCacheCapability: ProviderCacheCapability,
): PromptPlan {
  // First, check for explicit cache boundary markers
  const parts = renderedSystemPrompt.split(CACHE_BOUNDARY_MARKER);

  // If explicit markers found, use them
  if (parts.length > 1) {
    return createPlanFromParts(parts, providerCacheCapability);
  }

  // No explicit markers, check for implicit boundaries
  if (hasImplicitBoundaries(renderedSystemPrompt)) {
    const boundaryPositions = findImplicitBoundaries(renderedSystemPrompt);
    const implicitParts = splitByImplicitBoundaries(renderedSystemPrompt, boundaryPositions);
    return createPlanFromParts(implicitParts, providerCacheCapability);
  }

  // No boundaries found, return a single block with 'none' scope
  return {
    blocks: [
      {
        name: 'base',
        text: renderedSystemPrompt,
        cacheScope: 'none',
      },
    ],
  };
}

/**
 * Create a prompt plan from pre-split parts.
 *
 * This is shared logic for both explicit and implicit boundaries.
 *
 * @param parts - The pre-split text parts
 * @param providerCacheCapability - The provider's cache capability
 * @returns A prompt plan with cacheable blocks
 */
function createPlanFromParts(
  parts: string[],
  providerCacheCapability: ProviderCacheCapability,
): PromptPlan {
  // Create blocks from each part
  const blocks: PromptBlock[] = parts.map((part, index) => {
    const totalBlocks = parts.length;
    const defaultScope = getDefaultScopeForPosition(index, totalBlocks);
    const filteredScope = filterScopeByCapability(defaultScope, providerCacheCapability);
    const name = getBlockNameForPart(part, index, totalBlocks);
    const text = normalizeBlockText(part, index, totalBlocks);

    return {
      name,
      text,
      cacheScope: filteredScope,
    };
  });

  // Enforce maxCacheableBlocks: downgrade excess cacheable blocks to 'none'
  const maxCacheable = providerCacheCapability.maxCacheableBlocks;
  if (maxCacheable !== undefined && maxCacheable > 0) {
    let cacheableCount = 0;
    for (const block of blocks) {
      if (block.cacheScope !== 'none') {
        cacheableCount++;
        if (cacheableCount > maxCacheable) {
          (block as { cacheScope: CacheScope }).cacheScope = 'none';
        }
      }
    }
  }

  return { blocks };
}

/**
 * Get the block name for a given part, considering its content.
 *
 * This is a smarter version of getBlockName that looks at the content
 * to determine the appropriate name for the last block.
 *
 * @param part - The text content of this block
 * @param position - The block position (0-indexed)
 * @param totalBlocks - Total number of blocks
 * @returns The block name
 */
function getBlockNameForPart(part: string, position: number, totalBlocks: number): string {
  // First block is always 'base'
  if (position === 0) return 'base';

  // Last block: check content to determine name
  if (position === totalBlocks - 1) {
    // If the block contains "# Skills", it's sessionContext
    if (part.includes('# Skills')) {
      return 'sessionContext';
    }
    // If the block contains "# Project Information", it's projectInstructions
    if (part.includes('# Project Information')) {
      return 'projectInstructions';
    }
    // Default to sessionContext for last block
    return 'sessionContext';
  }

  // Middle blocks use sequential names from BLOCK_NAMES
  const intermediateIndex = position - 1;
  const nameIndex = intermediateIndex + 1;
  if (nameIndex < BLOCK_NAMES.length && nameIndex < BLOCK_NAMES.length - 1) {
    const name = BLOCK_NAMES[nameIndex];
    if (name !== undefined) return name;
  }

  return 'sessionContext';
}
