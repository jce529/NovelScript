/**
 * A setting document is an authored KB file. Template files and folders do
 * not count as progress, even when they live in the work scope.
 */
export function isSettingDocument(node: { node_type: string; category: string }): boolean {
  return node.node_type === 'file' && node.category !== 'template';
}
