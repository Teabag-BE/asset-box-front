import { request } from './client'

export const adminEmailApi = {
  getList: ({ page = 0, size = 20 } = {}) =>
    request(`/admin/email?page=${page}&size=${size}`),

  enroll: ({ email, name, major }) =>
    request('/admin/email', {
      method: 'POST',
      body: JSON.stringify({ email, name, major }),
    }),

  remove: (email) =>
    request('/admin/email', {
      method: 'DELETE',
      body: JSON.stringify({ email }),
    }),
}
