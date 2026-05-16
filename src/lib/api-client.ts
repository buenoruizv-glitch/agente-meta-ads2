export const apiFetch = async (url: string, options: RequestInit = {}) => {
  const headers = new Headers(options.headers || {});
  
  // En el navegador, obtenemos el cliente seleccionado de localStorage
  if (typeof window !== 'undefined') {
    const clientId = localStorage.getItem('currentClientId');
    if (clientId) {
      headers.set('X-Client-Id', clientId);
    }
  }
  
  return fetch(url, { ...options, headers });
};
