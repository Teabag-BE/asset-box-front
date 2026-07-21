import { request } from './client'

export const authApi = {
  signup: (body) => request('/users/signup', { method: 'POST', body: JSON.stringify(body), skipAuth: true }),
  login:  (body) => request('/users/login',  { method: 'POST', body: JSON.stringify(body), skipAuth: true }),
  verifyEmail: (token) => request(`/email/verify?token=${encodeURIComponent(token)}`, {
    method: 'GET',
    skipAuth: true,
    okOnNonJson: true,
  }),
}
