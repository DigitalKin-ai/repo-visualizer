import { isMatch } from "micromatch";

/**
 * True if path is excluded by either the path or glob criteria.
 * path may be to a directory or individual file.
 */
export const shouldExcludePath = (
  path: string,
  pathsToIgnore: Set<string>,
  globsToIgnore: string[]
): boolean => {
  if (!path) return false;
  
  const processedPath = processPath(path);

  // Check for direct .aider files first
  if (processedPath.startsWith('.aider')) {
    return true;
  }

  // Check exact paths
  if (pathsToIgnore.has(processedPath)) {
    return true;
  }

  // Check glob patterns
  return globsToIgnore.some(glob => {
    if (!glob) return false;
    
    // Special handling for .aider* patterns
    if (glob === '.aider*' || glob === './.aider*' || glob === '**/.aider*') {
      return processedPath.startsWith('.aider');
    }
    
    return isMatch(processedPath, glob, {
      dot: true,
      matchBase: true
    });
  });
};

const processPath = (path: string): string => {
  if (path.startsWith("./")) return path.substring(2);
  return path;
};
