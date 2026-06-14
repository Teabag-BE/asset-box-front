import { request } from './client'

export const categoryApi = {
  getAll:      () => request('/categories'),
  getRoots:    () => request('/categories/roots'),
  getChildren: (parentId) => request(`/categories/${parentId}/children`),
}
